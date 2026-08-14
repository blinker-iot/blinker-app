import { describe, expect, it, vi } from 'vitest';
import { GatewayLoginFacade } from './gateway-login.facade';

describe('GatewayLoginFacade', () => {
  it('deduplicates concurrent verification-code actions', async () => {
    let release: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const account = { sendEmailCode: vi.fn(() => pending) } as any;
    const facade = new GatewayLoginFacade(account);

    const first = facade.sendCode('person@example.com');
    const second = facade.sendCode('person@example.com');
    expect(await second).toBe(false);
    expect(account.sendEmailCode).toHaveBeenCalledTimes(1);
    release!();
    expect(await first).toBe(true);
  });
});
