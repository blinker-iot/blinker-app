import { HttpErrorResponse } from '@angular/common/http';
import { GatewayHttpError } from '../model/response.model';

export function isNetworkUnavailable(error: unknown): boolean {
  return (error instanceof GatewayHttpError && error.httpStatus === 0)
    || (error instanceof HttpErrorResponse && error.status === 0);
}
