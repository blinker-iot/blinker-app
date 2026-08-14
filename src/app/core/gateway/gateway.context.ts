import { HttpContext, HttpContextToken } from '@angular/common/http';

export type GatewayAuthMode = 'none' | 'public' | 'optional' | 'required';

export const GATEWAY_AUTH_MODE = new HttpContextToken<GatewayAuthMode>(() => 'required');
export const GATEWAY_ALLOW_REFRESH = new HttpContextToken<boolean>(() => true);
export const GATEWAY_REPLAYED = new HttpContextToken<boolean>(() => false);

export function gatewayContext(mode: GatewayAuthMode, allowRefresh = true): HttpContext {
  return new HttpContext()
    .set(GATEWAY_AUTH_MODE, mode === 'public' ? 'none' : mode)
    .set(GATEWAY_ALLOW_REFRESH, allowRefresh);
}
