import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { createGatewayRequestId, isGatewayRequest } from './gateway.config';
import {
  GATEWAY_ALLOW_REFRESH,
  GATEWAY_AUTH_MODE,
  GATEWAY_REPLAYED,
} from './gateway.context';
import { normalizeGatewayError } from './gateway-error';
import { GatewaySessionService } from './gateway-session.service';

export const gatewayInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isGatewayRequest(request.url)) return next(request);

  const session = inject(GatewaySessionService);
  const authMode = request.context.get(GATEWAY_AUTH_MODE);
  const accessToken = session.accessToken;
  let outbound = request.clone({
    setHeaders: {
      'X-Request-ID': request.headers.get('X-Request-ID') ?? createGatewayRequestId(),
    },
  });

  if (authMode !== 'none' && authMode !== 'public' && accessToken) {
    outbound = outbound.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } });
  }

  return next(outbound).pipe(
    catchError(error => {
      const normalized = normalizeGatewayError(error);
      const canRefresh = normalized.httpStatus === 401
        && authMode === 'required'
        && request.context.get(GATEWAY_ALLOW_REFRESH)
        && !request.context.get(GATEWAY_REPLAYED)
        && session.hasSession;

      if (!canRefresh) return throwError(() => normalized);

      return session.refreshOnce().pipe(
        switchMap(tokenPair => {
          const replay = request.clone({
            context: request.context.set(GATEWAY_REPLAYED, true),
            setHeaders: {
              Authorization: `Bearer ${tokenPair.accessToken}`,
              'X-Request-ID': createGatewayRequestId(),
            },
          });
          return next(replay).pipe(
            catchError(replayError => {
              const replayFailure = normalizeGatewayError(replayError);
              if (replayFailure.httpStatus === 401) session.expire();
              return throwError(() => replayFailure);
            }),
          );
        }),
        catchError(refreshError => throwError(() => normalizeGatewayError(refreshError))),
      );
    }),
  );
};
