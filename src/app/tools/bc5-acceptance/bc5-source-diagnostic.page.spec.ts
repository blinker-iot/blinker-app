import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceV2BleService } from '../../core/services/device-v2-ble.service';
import { Bc5SourceDiagnosticPage } from './bc5-source-diagnostic.page';

const getRecoveryAdmission = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', async importOriginal => {
  const real = await importOriginal<typeof import('@capacitor/core')>();
  return Object.assign({}, real, { Capacitor: Object.assign({}, real.Capacitor, { getPlatform: () => 'android',
    isPluginAvailable: (name: string) => name === 'BlinkerBc5Checkpoint' || real.Capacitor.isPluginAvailable(name) }),
    registerPlugin: (name: string, implementations?: Parameters<typeof real.registerPlugin>[1]) => name === 'BlinkerBc5Checkpoint'
      ? { getRecoveryAdmission } : real.registerPlugin(name, implementations) });
});

const profile = { origin: 'https://private.example.test', ownerUserId: 'owner', tenantId: 'tenant',
  region: 'Development' as const, intentId: 'AAAAAAAAAAAAAAAAAAAAAQ', sourceLogicalDeviceId: 'example-source', expiresAt: 1 };

describe('private BC5 source diagnostic page', () => {
  const diagnose = vi.fn<(value: typeof profile, signal: AbortSignal) => Promise<void>>();
  const restore = vi.fn();
  let fixture: ComponentFixture<Bc5SourceDiagnosticPage>;

  beforeEach(async () => {
    diagnose.mockReset(); restore.mockReset();
    getRecoveryAdmission.mockReset().mockResolvedValue(profile);
    await TestBed.configureTestingModule({ imports: [Bc5SourceDiagnosticPage], providers: [provideRouter([]),
      provideIonicAngular({ animated: false }),
      { provide: DeviceV2BleService, useValue: { diagnoseBc5SourcePresence: diagnose, restoreCommittedBc5PresenceAlias: restore } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(Bc5SourceDiagnosticPage);
  });

  async function render(message: string): Promise<HTMLElement> {
    const host = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('[role="status"]')?.textContent).toContain(message);
    });
    return host;
  }

  it('offers one explicit source-only action and reports a fixed success marker without implying radio proof', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const host = await render('就绪');
      const buttons = host.querySelectorAll('ion-button');
      expect(buttons).toHaveLength(1);
      expect(host.querySelector('input')).toBeNull();
      expect(host.querySelector('ion-back-button')?.getAttribute('defaultHref')).toBe('/home/device');
      expect(diagnose).not.toHaveBeenCalled();
      expect(host.textContent).not.toContain(profile.sourceLogicalDeviceId);

      diagnose.mockResolvedValueOnce(undefined);
      for (let i = 0; i < 2; ++i) buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await render('原蓝牙卡附近状态校验通过；不代表设备已在附近或上线');
      expect(diagnose).toHaveBeenCalledExactlyOnceWith(profile, expect.any(AbortSignal));
      expect(restore).not.toHaveBeenCalled();
      expect((buttons[0] as HTMLIonButtonElement).disabled).toBe(true);
      expect(info).toHaveBeenCalledExactlyOnceWith('BC5_SOURCE_PRESENCE_STOP', 'source-presence', 'passed');
    } finally { info.mockRestore(); }
  });

  it('keeps the action absent without the native recovery admission', async () => {
    getRecoveryAdmission.mockRejectedValueOnce(Error('hidden details'));
    const host = await render('入口不可用');
    expect(host.querySelector('ion-button')).toBeNull();
    expect(host.textContent).not.toContain('hidden details');
    expect(diagnose).not.toHaveBeenCalled();
  });

  it('reports only a bounded failure category and does not retry or render a raw error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const host = await render('就绪');
      diagnose.mockRejectedValueOnce(Error('private failure content'));
      host.querySelector('ion-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await render('原蓝牙卡检查未通过：outside-presence / unclassified');
      expect(warn).toHaveBeenCalledExactlyOnceWith('BC5_SOURCE_PRESENCE_STOP', 'outside-presence', 'unclassified');
      expect(host.textContent).not.toContain('private failure content');
      expect(diagnose).toHaveBeenCalledOnce();
      expect(restore).not.toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  it('aborts on leave and ignores late completion', async () => {
    const host = await render('就绪');
    let finish!: () => void;
    diagnose.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    host.querySelector('ion-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.componentInstance.ionViewWillLeave();
    expect(diagnose.mock.calls[0][1].aborted).toBe(true);
    finish();
    await render('已停止等待');
  });
});
