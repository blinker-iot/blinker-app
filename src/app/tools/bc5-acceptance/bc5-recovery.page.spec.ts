import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceV2BleService } from '../../core/services/device-v2-ble.service';
import { Bc5RecoveryPage } from './bc5-recovery.page';

const getRecoveryAdmission = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', async importOriginal => {
  const real = await importOriginal<typeof import('@capacitor/core')>();
  return Object.assign({}, real, { Capacitor: Object.assign({}, real.Capacitor, { getPlatform: () => 'android',
    isPluginAvailable: (name: string) => name === 'BlinkerBc5Checkpoint' || real.Capacitor.isPluginAvailable(name) }),
    registerPlugin: (name: string, implementations?: Parameters<typeof real.registerPlugin>[1]) => name === 'BlinkerBc5Checkpoint'
      ? { getRecoveryAdmission } : real.registerPlugin(name, implementations) });
});

const profile = { origin: 'https://private.example.test', ownerUserId: 'owner', tenantId: 'tenant',
  region: 'Development' as const, intentId: 'AAAAAAAAAAAAAAAAAAAAAQ', sourceLogicalDeviceId: 'source', expiresAt: 1 };

describe('private BC5 recovery page', () => {
  const restore = vi.fn<(value: typeof profile, signal: AbortSignal) => Promise<boolean>>();
  let fixture: ComponentFixture<Bc5RecoveryPage>;

  beforeEach(async () => {
    restore.mockReset();
    getRecoveryAdmission.mockReset().mockResolvedValue(profile);
    await TestBed.configureTestingModule({ imports: [Bc5RecoveryPage], providers: [provideRouter([]),
      provideIonicAngular({ animated: false }),
      { provide: DeviceV2BleService, useValue: { restoreCommittedBc5PresenceAlias: restore } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(Bc5RecoveryPage);
  });

  async function render(message: string): Promise<HTMLElement> {
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('[role="status"]')?.textContent).toContain(message);
    });
    return host;
  }

  it('offers one explicit action, with no installation or WiFi fields', async () => {
    const host = await render('就绪');
    const buttons = host.querySelectorAll('ion-button');
    expect(buttons).toHaveLength(1);
    expect(host.querySelector('input')).toBeNull();
    expect(host.querySelector('ion-back-button')?.getAttribute('defaultHref')).toBe('/home/device');
    expect(restore).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain(profile.intentId);
    expect(host.textContent).not.toContain(profile.sourceLogicalDeviceId);

    restore.mockResolvedValueOnce(true);
    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await render('本机引用已恢复');
    expect(restore).toHaveBeenCalledExactlyOnceWith(profile, expect.any(AbortSignal));
    expect((buttons[0] as HTMLIonButtonElement).disabled).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('不代表设备已在附近或已上线');
  });

  it('does not offer any operation if the native recovery profile is missing', async () => {
    getRecoveryAdmission.mockRejectedValueOnce(Error('hidden details'));
    const host = await render('入口不可用');
    expect(host.querySelector('ion-button')).toBeNull();
    expect(host.textContent).not.toContain('hidden details');
    expect(restore).not.toHaveBeenCalled();
  });

  it('logs one fixed diagnostic without logging a raw failure or retrying', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const host = await render('就绪');
      restore.mockRejectedValueOnce(new Error('never log this error body'));
      host.querySelector('ion-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await render('未确认恢复');
      expect(warn).toHaveBeenCalledExactlyOnceWith('BC5_RECOVERY_STOP', 'outside-presence', 'unclassified');
      expect(restore).toHaveBeenCalledOnce();
      expect(host.textContent).not.toContain('never log');
    } finally { warn.mockRestore(); }
  });

  it('cancels on leave and ignores the late result', async () => {
    const host = await render('就绪');
    let finish!: (result: boolean) => void;
    restore.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    host.querySelector('ion-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.componentInstance.ionViewWillLeave();
    expect(restore.mock.calls[0][1].aborted).toBe(true);
    finish(true);
    await render('已停止等待');
  });
});
