import { Injectable } from '@angular/core';
import {
  HttpBackend,
  HttpContextToken,
  HttpClient,
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { NavController } from '@ionic/angular/standalone';
import {
  Observable,
  TimeoutError,
  catchError,
  finalize,
  from,
  map,
  of,
  shareReplay,
  switchMap,
  throwError,
  timeout,
} from 'rxjs';
import { API, isGatewayUrl } from 'src/app/configs/api.config';
import {
  AilyResponse,
  AuthTokenPair,
  AuthTokenResponseData,
  GatewayHttpError,
  NormalizedHttpError,
} from '../model/response.model';
import { DataService } from '../services/data.service';

const REQUEST_RETRIED = new HttpContextToken<boolean>(() => false);
const REQUEST_REFRESH_TOKEN = new HttpContextToken<string>(() => '');
const GATEWAY_REQUEST_TIMEOUT_MS = 30_000;
const GATEWAY_UPLOAD_TIMEOUT_MS = 120_000;
let requestSequence = 0;

@Injectable()
export class ServerInterceptor implements HttpInterceptor {
  private readonly rawHttp: HttpClient;
  private refreshRequest: Observable<AuthTokenPair> | null = null;
  private refreshSource: {
    accessToken: string;
    refreshToken: string;
  } | null = null;
  private refreshTarget: {
    accessToken: string;
    refreshToken: string;
  } | null = null;
  private lastRefresh: {
    sourceAccessToken: string;
    sourceRefreshToken: string;
    tokens: AuthTokenPair;
  } | null = null;

  constructor(
    httpBackend: HttpBackend,
    private navCtrl: NavController,
    private dataService: DataService,
  ) {
    this.rawHttp = new HttpClient(httpBackend);
    this.dataService.authDataChanged.subscribe(() => {
      if (
        this.lastRefresh &&
        !this.tokensMatchCurrentSession(this.lastRefresh.tokens)
      ) {
        this.lastRefresh = null;
      }
      const current = this.dataService.auth;
      if (this.refreshRequest && this.refreshSource) {
        const matchesSource =
          this.refreshSource.accessToken === current?.accessToken &&
          this.refreshSource.refreshToken === current?.refreshToken;
        const matchesTarget =
          this.refreshTarget?.accessToken === current?.accessToken &&
          this.refreshTarget?.refreshToken === current?.refreshToken;
        if (!matchesSource && !matchesTarget) {
          this.refreshRequest = null;
          this.refreshSource = null;
          this.refreshTarget = null;
        }
      }
      if (
        this.refreshSource &&
        !this.refreshRequest &&
        (this.refreshSource.accessToken !== current?.accessToken ||
          this.refreshSource.refreshToken !== current?.refreshToken)
      ) {
        this.refreshSource = null;
      }
    });
  }

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler,
  ): Observable<HttpEvent<unknown>> {
    if (!isGatewayUrl(request.url)) return next.handle(request);

    const prepared = this.prepareGatewayRequest(request);
    return this.withGatewayTimeout(
      next.handle(prepared),
      this.gatewayTimeoutMs(prepared.url),
    ).pipe(
      catchError((error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 401 &&
          this.isProtected(prepared.url) &&
          !this.isAccountDeletionTokenMissing(prepared.url, error) &&
          !prepared.context.get(REQUEST_RETRIED) &&
          !!this.dataService.auth?.refreshToken
        ) {
          const recovery = this.tokensForUnauthorized(prepared);
          if (!recovery) {
            return throwError(() => this.normalizeError(error));
          }
          return recovery.pipe(
            catchError((refreshError: unknown) => {
              if (this.isAccountDeletionUrl(prepared.url)) {
                return throwError(() => this.normalizeError(refreshError));
              }
              if (this.requestMatchesCurrentSession(prepared)) {
                return this.expireSessionAndThrow(refreshError);
              }
              return throwError(() => this.normalizeError(error));
            }),
            switchMap((tokens) => {
              if (!this.tokensMatchCurrentSession(tokens)) {
                return throwError(() => this.normalizeError(error));
              }
              const replay = prepared.clone({
                headers: prepared.headers.set(
                  'Authorization',
                  'Bearer ' + tokens.accessToken,
                ),
                context: prepared.context
                  .set(REQUEST_RETRIED, true)
                  .set(REQUEST_REFRESH_TOKEN, tokens.refreshToken),
              });
              return this.withGatewayTimeout(
                next.handle(replay),
                this.gatewayTimeoutMs(replay.url),
              ).pipe(
                catchError((replayError: unknown) => {
                  if (
                    replayError instanceof HttpErrorResponse &&
                    replayError.status === 401
                  ) {
                    if (this.isAccountDeletionUrl(replay.url)) {
                      return throwError(() => this.normalizeError(replayError));
                    }
                    if (
                      !this.tokensMatchCurrentSession(tokens) ||
                      this.refreshInFlightFor(tokens)
                    ) {
                      return throwError(() => this.normalizeError(replayError));
                    }
                    return this.expireSessionAndThrow(replayError);
                  }
                  return throwError(() => this.normalizeError(replayError));
                }),
              );
            }),
          );
        }
        return throwError(() => this.normalizeError(error));
      }),
    );
  }

  private prepareGatewayRequest(
    request: HttpRequest<unknown>,
  ): HttpRequest<unknown> {
    let headers = request.headers;
    let sessionRefreshToken = '';
    const existingRequestId = headers.get('X-Request-ID')?.trim();
    const requestId = existingRequestId && existingRequestId.length <= 128
      ? existingRequestId
      : this.createRequestId();
    headers = headers.set('X-Request-ID', requestId);

    if (this.isPublic(request.url)) {
      headers = headers.delete('Authorization');
    } else {
      const auth = this.dataService.auth;
      const token = auth?.accessToken;
      if (token) headers = headers.set('Authorization', 'Bearer ' + token);
      sessionRefreshToken = auth?.refreshToken || '';
    }

    const body = this.stripLegacyAuthBody(request.body);
    if (this.shouldUseJsonContentType(request, body)) {
      headers = headers.set('Content-Type', 'application/json');
    }

    return request.clone({
      headers,
      body,
      context: request.context.set(
        REQUEST_REFRESH_TOKEN,
        sessionRefreshToken,
      ),
      params: request.params.delete('uuid').delete('token'),
    });
  }

  private refreshTokens(
    sourceAccessToken: string,
    sourceRefreshToken: string,
  ): Observable<AuthTokenPair> {
    if (this.refreshRequest) return this.refreshRequest;
    const refreshToken = this.dataService.auth?.refreshToken;
    if (!refreshToken) {
      return throwError(() => new GatewayHttpError({
        httpStatus: 401,
        code: 'AUTH_REFRESH_TOKEN_MISSING',
        message: 'The refresh token is missing.',
      }));
    }

    this.refreshSource = {
      accessToken: sourceAccessToken,
      refreshToken: sourceRefreshToken,
    };
    let createdRequest!: Observable<AuthTokenPair>;
    createdRequest = this.withGatewayTimeout(
      this.rawHttp.post<AilyResponse<AuthTokenResponseData>>(
        API.AUTH.REFRESH,
        { refresh_token: refreshToken },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': this.createRequestId(),
          },
        },
      ),
    ).pipe(
        map((response) => {
          const data = response?.data;
          if (!data?.access_token?.trim() || !data?.refresh_token?.trim()) {
            throw new GatewayHttpError({
              httpStatus: 401,
              code: 'AUTH_TOKEN_PAIR_INCOMPLETE',
              message: 'The refreshed token pair is incomplete.',
            });
          }
          return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenType: data.token_type?.trim() || 'bearer',
          };
        }),
        switchMap((tokens) => {
          if (this.refreshRequest === createdRequest) {
            this.refreshTarget = {
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
            };
          }
          const current = this.dataService.auth;
          if (
            current?.accessToken !== sourceAccessToken ||
            current.refreshToken !== sourceRefreshToken
          ) {
            return throwError(() => new GatewayHttpError({
              httpStatus: 401,
              code: 'AUTH_SESSION_CHANGED',
              message: 'The authenticated session changed during refresh.',
            }));
          }
          return from(this.dataService.replaceAuthData(
            {
              accessToken: sourceAccessToken,
              refreshToken: sourceRefreshToken,
            },
            tokens,
          )).pipe(
            switchMap((replaced) => {
              if (!replaced) {
                return throwError(() => new GatewayHttpError({
                  httpStatus: 401,
                  code: 'AUTH_SESSION_CHANGED',
                  message: 'The authenticated session changed during refresh.',
                }));
              }
              this.lastRefresh = {
                sourceAccessToken,
                sourceRefreshToken,
                tokens: { ...tokens },
              };
              return of(tokens);
            }),
          );
        }),
        catchError((error: unknown) =>
          throwError(() => this.normalizeError(error)),
        ),
        finalize(() => {
          if (this.refreshRequest === createdRequest) {
            this.refreshRequest = null;
            this.refreshSource = null;
            this.refreshTarget = null;
          }
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.refreshRequest = createdRequest;
    return createdRequest;
  }

  private tokensForUnauthorized(
    request: HttpRequest<unknown>,
  ): Observable<AuthTokenPair> | null {
    const attemptedToken = request.headers
      .get('Authorization')
      ?.replace(/^Bearer\s+/i, '');
    const attemptedRefreshToken = request.context.get(REQUEST_REFRESH_TOKEN);
    const current = this.dataService.auth;
    if (!attemptedToken || !attemptedRefreshToken || !current) return null;

    if (
      this.refreshRequest &&
      this.refreshSource?.accessToken === attemptedToken &&
      this.refreshSource.refreshToken === attemptedRefreshToken
    ) {
      return this.refreshRequest;
    }

    if (
      attemptedToken === current.accessToken &&
      attemptedRefreshToken === current.refreshToken
    ) {
      if (this.refreshRequest) {
        return this.refreshSource?.accessToken === current.accessToken &&
          this.refreshSource.refreshToken === current.refreshToken
          ? this.refreshRequest
          : null;
      }
      return this.refreshTokens(current.accessToken, current.refreshToken);
    }

    const lastRefresh = this.lastRefresh;
    if (
      lastRefresh?.sourceAccessToken === attemptedToken &&
      lastRefresh.sourceRefreshToken === attemptedRefreshToken &&
      this.tokensMatchCurrentSession(lastRefresh.tokens)
    ) {
      if (this.refreshInFlightFor(lastRefresh.tokens)) {
        return this.refreshRequest;
      }
      return of({
        accessToken: current.accessToken,
        refreshToken: current.refreshToken,
        tokenType: current.tokenType,
      });
    }
    return null;
  }

  private requestMatchesCurrentSession(
    request: HttpRequest<unknown>,
  ): boolean {
    const attemptedToken = request.headers
      .get('Authorization')
      ?.replace(/^Bearer\s+/i, '');
    const attemptedRefreshToken = request.context.get(REQUEST_REFRESH_TOKEN);
    const current = this.dataService.auth;
    return !!attemptedToken &&
      !!attemptedRefreshToken &&
      attemptedToken === current?.accessToken &&
      attemptedRefreshToken === current.refreshToken;
  }

  private tokensMatchCurrentSession(tokens: AuthTokenPair): boolean {
    const current = this.dataService.auth;
    return !!current &&
      current.accessToken === tokens.accessToken &&
      current.refreshToken === tokens.refreshToken;
  }

  private refreshInFlightFor(
    tokens: Pick<AuthTokenPair, 'accessToken' | 'refreshToken'>,
  ): boolean {
    return !!this.refreshRequest &&
      this.refreshSource?.accessToken === tokens.accessToken &&
      this.refreshSource.refreshToken === tokens.refreshToken;
  }

  private expireSessionAndThrow(
    error: unknown,
  ): Observable<never> {
    const normalized = this.normalizeError(error);
    const expectedEpoch = this.dataService.sessionEpoch;
    return from(this.clearExpiredSession(expectedEpoch)).pipe(
      switchMap(() => throwError(() => normalized)),
    );
  }

  private async clearExpiredSession(expectedEpoch: number): Promise<void> {
    if (this.dataService.sessionEpoch !== expectedEpoch) return;
    this.dataService.authDataExpire.next(true);
    await this.dataService.removeAuthData();
    if (
      this.dataService.sessionEpoch === expectedEpoch + 1 &&
      !this.dataService.auth
    ) {
      await this.navCtrl.navigateRoot('/login');
    }
  }

  private normalizeError(error: unknown): GatewayHttpError {
    if (error instanceof GatewayHttpError) return error;
    if (error instanceof TimeoutError) {
      return new GatewayHttpError({
        httpStatus: 0,
        code: 'GATEWAY_TIMEOUT',
        message: 'Gateway request timed out.',
      });
    }
    if (!(error instanceof HttpErrorResponse)) {
      return new GatewayHttpError({
        httpStatus: 0,
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network request failed.',
      });
    }

    const body = this.isRecord(error.error) ? error.error : {};
    const responseText = typeof error.error === 'string' ? error.error.trim() : '';
    const codeValue = body['errorCode'] ?? body['code'];
    const messageValue = body['errorMessage'] ?? body['message'];
    const normalized: NormalizedHttpError = {
      httpStatus: error.status,
      code: codeValue === null || codeValue === undefined || codeValue === ''
        ? 'HTTP_' + error.status
        : String(codeValue),
      message: typeof messageValue === 'string' && messageValue.trim()
        ? messageValue
        : responseText || error.message || 'Gateway request failed.',
      requestId:
        error.headers?.get('X-Request-ID') ||
        (typeof body['requestId'] === 'string' ? body['requestId'] : undefined),
      data: body['data'],
      retryAfterSeconds: this.parseRetryAfter(
        error.headers?.get('Retry-After'),
      ),
    };
    return new GatewayHttpError(normalized);
  }

  private isPublic(url: string): boolean {
    return [
      API.AUTH.ALTCHA_CHALLENGE,
      API.AUTH.EMAIL_CODE,
      API.AUTH.EMAIL_LOGIN,
      API.AUTH.WECHAT_MOBILE_START,
      API.AUTH.WECHAT_MOBILE_LOGIN,
      API.AUTH.REFRESH,
    ].includes(url as never);
  }

  private isProtected(url: string): boolean {
    if (this.isPublic(url)) return false;
    return url !== API.FEEDBACK.SUBMIT && url !== API.FEEDBACK.UPLOAD_IMAGE;
  }

  private shouldUseJsonContentType(
    request: HttpRequest<unknown>,
    body: unknown,
  ): boolean {
    return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      body !== null &&
      body !== undefined &&
      !(body instanceof FormData) &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer);
  }

  private stripLegacyAuthBody(body: unknown): unknown {
    if (
      body instanceof FormData ||
      body instanceof Blob ||
      body instanceof ArrayBuffer ||
      ArrayBuffer.isView(body)
    ) {
      return body;
    }
    if (!this.isRecord(body)) return body;
    const clone = { ...body };
    delete clone['uuid'];
    delete clone['token'];
    return clone;
  }

  private createRequestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    requestSequence += 1;
    return 'app-' + Date.now().toString(36) + '-' + requestSequence.toString(36);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private isAccountDeletionTokenMissing(
    url: string,
    error: HttpErrorResponse,
  ): boolean {
    if (!this.isAccountDeletionUrl(url)) return false;
    const body = this.isRecord(error.error) ? error.error : {};
    return body['errorCode'] === 'AUTH_TOKEN_MISSING'
      || body['code'] === 'AUTH_TOKEN_MISSING';
  }

  private isAccountDeletionUrl(url: string): boolean {
    return url === API.ACCOUNT.ROOT || url === API.ACCOUNT.DELETION_CODE;
  }

  private parseRetryAfter(value: string | null | undefined): number | undefined {
    const normalized = value?.trim();
    if (!normalized) return undefined;
    if (/^\d+$/.test(normalized)) {
      const seconds = Number(normalized);
      return Number.isSafeInteger(seconds) ? seconds : undefined;
    }

    const retryAt = Date.parse(normalized);
    if (!Number.isFinite(retryAt)) return undefined;
    return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  }

  private gatewayTimeoutMs(url: string): number {
    return url === API.FEEDBACK.UPLOAD_IMAGE
      ? GATEWAY_UPLOAD_TIMEOUT_MS
      : GATEWAY_REQUEST_TIMEOUT_MS;
  }

  private withGatewayTimeout<T>(
    source: Observable<T>,
    timeoutMs = GATEWAY_REQUEST_TIMEOUT_MS,
  ): Observable<T> {
    return source.pipe(timeout({ each: timeoutMs }));
  }
}
