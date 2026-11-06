import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBc5LaunchProfile, readBc5LaunchProfile, readBc5RecoveryProfile } from './bc5-launch-profile';

const bridge = vi.hoisted(() => ({ getPlatform: vi.fn(), isPluginAvailable: vi.fn(), getAdmission: vi.fn(),
  getRecoveryAdmission: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: bridge.getPlatform, isPluginAvailable: bridge.isPluginAvailable },
  registerPlugin: () => ({ getAdmission: bridge.getAdmission, getRecoveryAdmission: bridge.getRecoveryAdmission }),
}));

function fixture() {
  return { origin: 'https://private-bc5.example.test', ownerUserId: 'owner', tenantId: 'tenant', region: 'Development',
    intentId: 'AAAAAAAAAAAAAAAAAAAAAQ', sourceLogicalDeviceId: 'source', expiresAt: Date.now() + 60_000 };
}

beforeEach(() => {
  vi.resetAllMocks();
  bridge.getPlatform.mockReturnValue('android');
  bridge.isPluginAvailable.mockReturnValue(true);
});

describe('BC5 explicit native launch profile', () => {
  it('reads the one Android candidate bridge and detaches an exact admission', async () => {
    const source = fixture(); bridge.getAdmission.mockResolvedValue(source);
    const admission = await readBc5LaunchProfile();
    expect(admission).toEqual(source);
    expect(admission).not.toBe(source);
    source.origin = 'https://other.example.test';
    expect(admission?.origin).toBe('https://private-bc5.example.test');
    expect(bridge.isPluginAvailable).toHaveBeenCalledWith('BlinkerBc5Checkpoint');
    expect(bridge.getAdmission).toHaveBeenCalledExactlyOnceWith();
  });

  it('returns no profile on other platforms or a normal Android build with no native bridge', async () => {
    for (const platform of ['web', 'ios']) {
      bridge.getPlatform.mockReturnValue(platform);
      await expect(readBc5LaunchProfile()).resolves.toBeUndefined();
      await expect(readBc5RecoveryProfile()).resolves.toBeUndefined();
    }
    expect(bridge.isPluginAvailable).not.toHaveBeenCalled();
    bridge.getPlatform.mockReturnValue('android'); bridge.isPluginAvailable.mockReturnValue(false);
    await expect(readBc5LaunchProfile()).resolves.toBeUndefined();
    await expect(readBc5RecoveryProfile()).resolves.toBeUndefined();
    expect(bridge.getAdmission).not.toHaveBeenCalled();
    expect(bridge.getRecoveryAdmission).not.toHaveBeenCalled();
  });

  it('rejects extras, inherited/missing fields and noncanonical or invalid values', () => {
    const { tenantId: _, ...missing } = fixture(), getter = vi.fn(() => 'tenant');
    const accessor = Object.defineProperty({ ...missing }, 'tenantId', { get: getter, enumerable: true });
    for (const bad of [null, [], missing, { ...missing, tenantId: undefined }, accessor, Object.create(fixture()),
      { ...fixture(), token: 'unexpected' },
      { ...fixture(), origin: 'http://private-bc5.example.test' }, { ...fixture(), origin: 'https://private-bc5.example.test/path' },
      { ...fixture(), region: 'unknown' }, { ...fixture(), intentId: 'wrong' }, { ...fixture(), expiresAt: 'expired' }]) {
      expect(() => parseBc5LaunchProfile(bad)).toThrow(/^BC5_ACCEPTANCE_ADMISSION_INVALID$/);
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('keeps an expired admission readable for explicit recovery and does not leak native failure details', async () => {
    const expired = { ...fixture(), expiresAt: Date.now() - 60_000 };
    expect(parseBc5LaunchProfile(expired)).toEqual(expired);
    bridge.getAdmission.mockRejectedValue(Error('native details to suppress'));
    await expect(readBc5LaunchProfile()).rejects.toThrow(/^BC5_LAUNCH_PROFILE_UNAVAILABLE$/);
  });

  it('requires the separate native recovery admission and never falls back to the install admission', async () => {
    const expired = { ...fixture(), expiresAt: Date.now() - 60_000 };
    bridge.getRecoveryAdmission.mockRejectedValueOnce(Error('legacy-only')).mockResolvedValueOnce(expired)
      .mockResolvedValueOnce({ ...expired, token: 'unexpected' });
    await expect(readBc5RecoveryProfile()).rejects.toThrow(/^BC5_LAUNCH_PROFILE_UNAVAILABLE$/);
    await expect(readBc5RecoveryProfile()).resolves.toEqual(expired);
    await expect(readBc5RecoveryProfile()).rejects.toThrow(/^BC5_ACCEPTANCE_ADMISSION_INVALID$/);
    expect(bridge.getAdmission).not.toHaveBeenCalled();
  });
});
