import { afterEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ platform: vi.fn(() => true), listen: vi.fn(), status: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: native.platform } }));
vi.mock('@capacitor/network', () => ({ Network: { addListener: native.listen, getStatus: native.status } }));
import { NetworkService } from './network.service';
const turn = async () => { for (let i = 0; i < 20; ++i) await Promise.resolve(); };
afterEach(() => vi.resetAllMocks());
describe('native connectivity evidence, independent of account and MQTT', () => {
  it('invalidates LAN evidence on WiFi-to-WiFi events even while connected stays true', async () => {
    native.platform.mockReturnValue(true); let event!: (s: any) => void;
    native.listen.mockImplementation(async (_name, cb) => { event = cb; return { remove: vi.fn() }; });
    native.status.mockResolvedValue({ connected: true, connectionType: 'wifi' });
    const network = new NetworkService(); network.init(); await turn();
    const generation = network.current.generation;
    expect(network.current.wifi).toBe(true);
    event({ connected: true, connectionType: 'wifi' });
    expect(network.current.generation).toBe(generation + 1); expect(network.current.wifi).toBe(true);
    event({ connected: true, connectionType: 'cellular' });
    expect(network.current.wifi).toBe(false); expect(network.offline).toBe(false);
  });
  it('unknown/web does not authorize offline and never consults the browser network hint', async () => {
    native.platform.mockReturnValue(false); const network = new NetworkService(); network.init();
    expect(network.offline).toBe(false); expect(native.listen).not.toHaveBeenCalled();
  });
  it('one listener observes explicit disconnected, then immediately retires that evidence on connect', async () => {
    native.platform.mockReturnValue(true); let event!: (s: any) => void;
    native.listen.mockImplementation(async (_name, cb) => { event = cb; return { remove: vi.fn() }; });
    native.status.mockResolvedValue({ connected: false });
    const network = new NetworkService(); network.init(); network.init(); await turn();
    expect(network.offline).toBe(true); expect(native.listen).toHaveBeenCalledOnce();
    event({ connected: true }); expect(network.offline).toBe(false);
    event({ connected: undefined }); expect(network.offline).toBe(false);
  });
  it('a late initial query cannot overwrite a newer native event', async () => {
    native.platform.mockReturnValue(true); let event!: (s: any) => void, finish!: (s: any) => void;
    native.listen.mockImplementation(async (_name, cb) => { event = cb; return { remove: vi.fn() }; });
    native.status.mockImplementation(() => new Promise(r => { finish = r; }));
    const network = new NetworkService(); network.init(); await turn();
    event({ connected: true }); finish({ connected: false }); await turn(); expect(network.offline).toBe(false);
  });
  it('native failure means unknown and removes the partial listener', async () => {
    native.platform.mockReturnValue(true); const remove = vi.fn(async () => undefined);
    let event!: (s: any) => void;
    native.listen.mockImplementation(async (_name, cb) => { event = cb; return { remove }; });
    native.status.mockRejectedValue(Error('FAILED'));
    const network = new NetworkService(); network.init(); await turn();
    expect(network.offline).toBe(false); expect(remove).toHaveBeenCalledOnce();
    event({ connected: false }); expect(network.offline).toBe(false);
  });
});
