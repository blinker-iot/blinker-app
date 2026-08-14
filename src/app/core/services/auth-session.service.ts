import { HttpBackend, HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { DataService } from './data.service';
import {
  BehaviorSubject,
  Observable,
  catchError,
  finalize,
  map,
  shareReplay,
  tap,
  throwError,
} from 'rxjs';
import { API } from '../../configs/api.config';
import { createGatewayRequestId } from '../injectable/gateway.context';
import { GatewayError, normalizeGatewayError } from '../model/gateway-error.model';
import { AilyEnvelope, GatewayTokenPair, GatewayTokenResponse } from '../model/gateway.model';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly rawHttp: HttpClient;
  private readonly tokenPairSubject = new BehaviorSubject<GatewayTokenPair | null>(null);
  private refreshRequest?: Observable<GatewayTokenPair>;

  readonly tokenPair$ = this.tokenPairSubject.asObservable();

  constructor(
    backend: HttpBackend,
    private router: Router,
    private dataService: DataService,
  ) {
    this.rawHttp = new HttpClient(backend);
  }

  get tokenPair(): GatewayTokenPair | null {
    return this.tokenPairSubject.value;
  }

  get accessToken(): string | undefined {
    return this.tokenPair?.accessToken;
  }

  get hasSession(): boolean {
    return !!(this.tokenPair?.accessToken && this.tokenPair?.refreshToken);
  }

  establish(response: GatewayTokenResponse): GatewayTokenPair {
    const tokenPair = this.toTokenPair(response);
    this.tokenPairSubject.next(tokenPair);
    return tokenPair;
  }

  setTokenPair(tokenPair: GatewayTokenPair): void {
    if (!tokenPair?.accessToken?.trim() || !tokenPair?.refreshToken?.trim()) {
      throw new GatewayError(
        502,
        'AUTH_TOKEN_PAIR_INCOMPLETE',
        'The authentication response did not include a complete token pair.',
      );
    }
    this.tokenPairSubject.next({ ...tokenPair });
  }

  clear(): void {
    this.tokenPairSubject.next(null);
  }

  expire(): void {
    this.clear();
    this.dataService.authDataExpire.next(true);
    this.dataService.user = undefined;
    this.dataService.device = { dict: {}, list: [] };
    this.dataService.room = { dict: {}, list: [] };
    this.dataService.scene = { dict: {}, list: [] };
    this.dataService.auto = { dict: {}, list: [] };
    this.dataService.block = { dict: {}, list: [] };
    this.dataService.brokers = { dict: {}, list: [] };
    this.dataService.share = {
      share: {},
      share0: {},
      shared: [],
      shared0: [],
    };
    this.dataService.hasProDevice = false;
    this.dataService.isDeveloper = false;
    this.dataService.userDataLoader.next(false);
    this.dataService.deviceDataLoader.next(false);
    this.dataService.initCompleted.next(false);
    this.dataService.firstBoot = true;
    void this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  refreshOnce(): Observable<GatewayTokenPair> {
    if (this.refreshRequest) return this.refreshRequest;

    const refreshToken = this.tokenPair?.refreshToken;
    if (!refreshToken) {
      return throwError(() => new GatewayError(
        401,
        'AUTH_TOKEN_MISSING',
        'No refresh token is available.',
      ));
    }

    this.refreshRequest = this.rawHttp.post<AilyEnvelope<GatewayTokenResponse>>(
      API.GATEWAY.AUTH.REFRESH,
      { refresh_token: refreshToken },
      {
        headers: new HttpHeaders({
          'Content-Type': 'application/json',
          'X-Request-ID': createGatewayRequestId(),
        }),
      },
    ).pipe(
      map(response => this.readTokenEnvelope(response)),
      tap(tokenPair => this.tokenPairSubject.next(tokenPair)),
      catchError(error => {
        this.expire();
        return throwError(() => normalizeGatewayError(error));
      }),
      finalize(() => this.refreshRequest = undefined),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.refreshRequest;
  }

  refresh(): Observable<GatewayTokenPair> {
    return this.refreshOnce();
  }

  private readTokenEnvelope(response: AilyEnvelope<GatewayTokenResponse>): GatewayTokenPair {
    if (response?.status !== 200 || response.errorCode != null) {
      throw new GatewayError(
        Number(response?.status) || 400,
        String(response?.errorCode ?? 'AUTH_REFRESH_FAILED'),
        response?.errorMessage ?? 'Token refresh failed.',
        undefined,
        response,
      );
    }
    return this.toTokenPair(response.data);
  }

  private toTokenPair(response: GatewayTokenResponse): GatewayTokenPair {
    const accessToken = response?.access_token?.trim();
    const refreshToken = response?.refresh_token?.trim();
    if (!accessToken || !refreshToken) {
      throw new GatewayError(
        502,
        'AUTH_TOKEN_PAIR_INCOMPLETE',
        'The authentication response did not include a complete token pair.',
      );
    }
    return {
      accessToken,
      refreshToken,
      tokenType: response.token_type,
      expiresIn: response.expiresIn,
    };
  }
}
