import { HttpErrorResponse } from '@angular/common/http';

export class GatewayError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export function normalizeGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;

  if (error instanceof HttpErrorResponse) {
    const body = error.error && typeof error.error === 'object' ? error.error : null;
    const code = body?.errorCode ?? body?.code ?? `HTTP_${error.status || 0}`;
    const message = body?.errorMessage ?? body?.message ?? error.message ?? 'Request failed';
    return new GatewayError(
      error.status || 0,
      String(code),
      String(message),
      error.headers?.get('x-request-id') ?? undefined,
      body,
    );
  }

  const message = error instanceof Error ? error.message : 'Request failed';
  return new GatewayError(0, 'NETWORK_ERROR', message, undefined, error);
}
