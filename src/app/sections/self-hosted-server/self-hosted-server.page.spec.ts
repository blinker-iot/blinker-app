import '@angular/compiler';
import { ChangeDetectorRef } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayHttpError } from '../../core/model/response.model';
import { DeviceV2Service } from '../../core/services/device-v2.service';
import { SelfHostedServerConfig, SelfHostedServerService } from '../../core/services/self-hosted-server.service';
import { SelfHostedServerPage } from './self-hosted-server.page';

describe('SelfHostedServerPage', () => {
  const enabled: SelfHostedServerConfig = {
    state: 'enabled', serverUrl: 'https://broker.example.com/', keyConfigured: true,
    lastVerifiedAt: 1, lastErrorCode: null,
  };
  let service: { getConfig: ReturnType<typeof vi.fn>; saveConfig: ReturnType<typeof vi.fn>;
    normalizeAddress: ReturnType<typeof vi.fn> };
  let connection: { stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> };
  let page: SelfHostedServerPage;

  beforeEach(async () => {
    service = {
      getConfig: vi.fn().mockResolvedValue(enabled),
      saveConfig: vi.fn().mockResolvedValue({ ...enabled, lastVerifiedAt: 2 }),
      normalizeAddress: vi.fn().mockReturnValue(enabled.serverUrl),
    };
    connection = { stop: vi.fn().mockResolvedValue(undefined), start: vi.fn().mockResolvedValue(undefined) };
    page = new SelfHostedServerPage(
      service as unknown as SelfHostedServerService,
      {} as AlertController,
      connection as unknown as DeviceV2Service,
      { markForCheck: vi.fn() } as unknown as ChangeDetectorRef,
    );
    await page.ionViewWillEnter();
  });

  it('retains an unchanged key and reconnects after the save succeeds', async () => {
    expect(page.serverKey).toBe('');
    await page.save();
    expect(service.saveConfig).toHaveBeenCalledWith(enabled.serverUrl, undefined);
    expect(connection.stop).toHaveBeenCalledOnce();
    expect(connection.start).toHaveBeenCalledOnce();
    expect(page.saved).toBe(true);
  });

  it('shows the existing normalized Gateway error without changing configuration or connection', async () => {
    page.serverKey = 'incorrect';
    service.saveConfig.mockRejectedValue(new GatewayHttpError({
      httpStatus: 503, code: 'SELF_HOSTED_SERVER_AUTH_FAILED', message: 'Rejected',
    }));
    await page.save();
    expect(page.errorMessage).toBe('服务器密钥验证失败，请检查密钥');
    expect(page.config).toBe(enabled);
    expect(page.saved).toBe(false);
    expect(connection.stop).not.toHaveBeenCalled();
    expect(connection.start).not.toHaveBeenCalled();
  });

  it('keeps a committed configuration visible if reconnecting fails', async () => {
    page.serverKey = 'test-key';
    connection.start.mockRejectedValue(new Error('offline'));
    await page.save();
    expect(page.saved).toBe(true);
    expect(page.config?.lastVerifiedAt).toBe(2);
    expect(page.serverKey).toBe('');
    expect(page.errorMessage).toContain('配置已生效');
  });

  it('blocks saving stale configuration when a later read fails', async () => {
    service.getConfig.mockRejectedValue(new GatewayHttpError({
      httpStatus: 503, code: 'DEPENDENCY_UNAVAILABLE', message: 'Offline',
    }));
    await page.ionViewWillEnter();
    expect(page.statusText).toBe('配置读取失败');
    await page.save();
    expect(service.saveConfig).not.toHaveBeenCalled();
  });
});
