import { HttpContext } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import {
  GATEWAY_ALLOW_REFRESH,
  GATEWAY_AUTH_MODE,
  GATEWAY_REQUEST,
  gatewayContext,
} from './gateway.context';

describe('Gateway request context', () => {
  it('marks gateway calls explicitly with their auth behavior', () => {
    const context = gatewayContext('optional', false);

    expect(context.get(GATEWAY_REQUEST)).toBe(true);
    expect(context.get(GATEWAY_AUTH_MODE)).toBe('optional');
    expect(context.get(GATEWAY_ALLOW_REFRESH)).toBe(false);
  });

  it('leaves ordinary HTTP requests outside the gateway interceptor', () => {
    const context = new HttpContext();

    expect(context.get(GATEWAY_REQUEST)).toBe(false);
  });
});
