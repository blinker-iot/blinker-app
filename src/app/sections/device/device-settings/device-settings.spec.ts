import { BehaviorSubject } from 'rxjs';

import { DeviceSettingsPage } from './device-settings';
import { GatewayHttpError } from '../../../core/model/response.model';
import { CapacitorWiFiProvAllocationStore } from '../../../core/device-v2/provisioning/wifiprov-allocation-store';

describe('DeviceSettingsPage V2 access flow', () => {
  const logicalDeviceId = 'device_11111111-1111-4111-8111-111111111111';
  const deviceKey = 'A'.repeat(43);

  function harness(confirmRole = 'confirm') {
    const device: any = {
      logicalDeviceId,
      credentialVersion: 1,
      locator: 'locator-v1',
      id: logicalDeviceId,
      deviceName: logicalDeviceId,
      deviceType: 'edge-hub',
      state: 'active',
      cloudEnabled: true,
      config: {
        customName: 'Hybrid light',
        image: 'diyarduino.png',
        isShared: false,
        mode: 'bbp2',
      },
      data: {},
      storage: {},
      cloudLastSeenAt: 1_700_000_000_000,
    };
    const route = {
      paramMap: new BehaviorSubject<{ get: (name: string) => string | null }>({ get: (name: string) => name === 'id' ? logicalDeviceId : null }),
    };
    const data = {
      auth: { uuid: 'owner' }, sessionEpoch: 1,
      authDataChanged: new BehaviorSubject<void>(undefined),
      deviceDataLoader: new BehaviorSubject(true),
      getDevice: vi.fn(() => device),
      updateDeviceV2DisplayMetadata: vi.fn(value => { device.displayMetadata = value; device.name = value.name; device.config.customName = value.name; }),
    };
    const management = {
      revealDeviceKeyV2: vi.fn().mockResolvedValue({
        status: 200,
        data: { logicalDeviceId, credentialVersion: 1, locator: 'locator-v1', deviceKey },
      }),
      rotateDeviceKeyV2: vi.fn(),
      deleteDeviceV2: vi.fn(),
      getDisplayMetadataV2: vi.fn().mockResolvedValue({ logicalDeviceId, revision: 0, name: 'Hybrid light', capabilities: [] }),
      saveDisplayMetadataV2: vi.fn().mockImplementation(async value => ({ ...value, revision: value.revision + 1 })),
    };
    const users = { getAllInfo: vi.fn().mockResolvedValue(true) };
    const alert = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: confirmRole }),
    };
    const alerts = { create: vi.fn().mockResolvedValue(alert) };
    const nav = { navigateForward: vi.fn().mockResolvedValue(true) };
    const notice = { showToast: vi.fn().mockResolvedValue(undefined) };
    const cd = { markForCheck: vi.fn() };
    const page = new DeviceSettingsPage(
      route as any,
      users as any,
      {} as any,
      data as any,
      alerts as any,
      nav as any,
      {} as any,
      {} as any,
      management as any,
      { isAvailable: false } as any,
      notice as any,
      cd as any,
      { load: () => ({ fields: [{ key: 'power', kind: 0, type: 0, id: 1, access: 7 }] }) } as any,
    );
    page.ngOnInit();
    return { page, device, data, management, users, alerts, nav, notice, route };
  }

  it('keeps one task entry for ordinary WiFi candidates without promising firmware support or a fixed capacity', () => {
    const f = harness(); f.device.deviceType = 'wifi';
    const entry = f.page.deviceMenuItems.find(item => item.id === 'timer')!;
    expect(entry.disabled).toBe(false);
    expect(entry.description).toContain('查询');
    expect(entry.description).not.toContain('4');
    f.page.selectMenuItem(entry);
    expect(f.nav.navigateForward).toHaveBeenCalledExactlyOnceWith(`/device-manager/${logicalDeviceId}/timer`);
    f.page.ngOnDestroy();
  });

  it('reuses the existing storage route as actual State history without advertising fabricated quota', () => {
    const f = harness(); const entry = f.page.deviceMenuItems.find(item => item.id === 'storage')!;
    expect(entry.title).toBe('状态历史'); expect(entry.description).toContain('服务器实际收到');
    expect(entry.description).not.toContain('用量'); f.page.selectMenuItem(entry);
    expect(f.nav.navigateForward).toHaveBeenCalledExactlyOnceWith(`/device-manager/${logicalDeviceId}/storage`);
    f.page.ngOnDestroy();
  });

  it.each([
    ['预览', { config: { isPreview: true } }], ['分享', { config: { isShared: true } }],
    ['停用', { config: { disabled: true } }], ['旧协议', { config: { mode: 'legacy' } }],
    ['BLE', { deviceType: 'ble' }], ['网关', { deviceType: 'edge-hub' }], ['子设备', { gatewayRouted: true }],
  ])('disables the task entry for %s and rechecks direct selection', (_label, patch: any) => {
    const f = harness(); f.device.deviceType = 'wifi';
    Object.assign(f.device, { ...patch, config: { ...f.device.config, ...patch.config } });
    const entry = f.page.deviceMenuItems.find(item => item.id === 'timer')!;
    expect(entry.disabled).toBe(true); expect(entry.showChevron).toBe(false);
    expect(entry.description).toBeTruthy(); expect(entry.route).toBeUndefined();
    f.page.selectMenuItem({ ...entry, disabled: false, route: `/device-manager/${logicalDeviceId}/timer` });
    expect(f.nav.navigateForward).not.toHaveBeenCalled();
    f.page.ngOnDestroy();
  });


  it('renames through V2 CAS and preserves existing shared capability aliases', async () => {
    const f = harness();
    const current = { logicalDeviceId, revision: 3, name: 'Hybrid light', capabilities: [
      { key: 'power', kind: 0, type: 0, displayName: '电源' } ] };
    f.management.getDisplayMetadataV2.mockResolvedValue(current);
    await f.page.saveName('  客厅灯  ');
    expect(f.management.saveDisplayMetadataV2).toHaveBeenCalledExactlyOnceWith({ ...current, name: '客厅灯' });
    expect(f.data.updateDeviceV2DisplayMetadata).toHaveBeenCalledWith({ ...current, revision: 4, name: '客厅灯' });
    expect(f.device.config.customName).toBe('客厅灯');
    f.page.ngOnDestroy();
  });

  it('freezes the nickname dialog revision before editing and does not fetch a newer base after confirmation', async () => {
    const f = harness();
    const baseline = { logicalDeviceId, revision: 1, name: '旧名称', capabilities: [
      { key: 'power', kind: 0, type: 0, displayName: '电源' } ] };
    f.management.getDisplayMetadataV2.mockResolvedValue(baseline);
    await f.page.showChangeNameConfirm();
    const options = f.alerts.create.mock.calls[0][0] as any;
    expect(options.inputs[0].value).toBe('旧名称');
    f.management.getDisplayMetadataV2.mockResolvedValue({ ...baseline, revision: 2, name: '另一端修改' });
    f.management.saveDisplayMetadataV2.mockRejectedValueOnce(new GatewayHttpError({ httpStatus: 409,
      code: 'DEVICE_V2_DISPLAY_METADATA_CONFLICT', message: 'Conflict' }));
    options.buttons[1].handler({ customName: '我的修改' });
    await vi.waitFor(() => expect(f.page.displayBusy).toBe(false));
    expect(f.management.getDisplayMetadataV2).toHaveBeenCalledTimes(1);
    expect(f.management.saveDisplayMetadataV2).toHaveBeenCalledExactlyOnceWith({ ...baseline, name: '我的修改' });
    expect(f.page.displayError).toContain('不会自动覆盖');
  });

  it('keeps alias form revision on save, preserves orphan aliases and explicitly stops after CAS conflict', async () => {
    const f = harness();
    const current = { logicalDeviceId, revision: 4, name: 'Lamp', capabilities: [
      { key: 'removed', kind: 0, type: 2, displayName: '旧能力' } ] };
    f.management.getDisplayMetadataV2.mockResolvedValue(current);
    await f.page.loadDisplayMetadata();
    f.page.displayRows[0].displayName = '电源开关';
    f.page.displayRows[0].trueLabel = '亮';
    f.management.saveDisplayMetadataV2.mockRejectedValueOnce(new GatewayHttpError({ httpStatus: 409,
      code: 'DEVICE_V2_DISPLAY_METADATA_CONFLICT', message: 'Conflict' }));
    await f.page.saveDisplayMetadata();
    expect(f.management.getDisplayMetadataV2).toHaveBeenCalledTimes(1);
    expect(f.management.saveDisplayMetadataV2).toHaveBeenCalledExactlyOnceWith({ ...current, capabilities: [
      ...current.capabilities, { key: 'power', kind: 0, type: 0, displayName: '电源开关', trueLabel: '亮' } ] });
    expect(f.page.displayError).toContain('不会自动覆盖');
    expect(f.page.canSaveDisplay).toBe(false);
    await f.page.saveDisplayMetadata();
    expect(f.management.saveDisplayMetadataV2).toHaveBeenCalledTimes(1);
    f.page.ngOnDestroy();
  });

  it.each(['read', 'write'])('does not apply a late nickname %s result to another account', async operation => {
    const f = harness();
    const current = { logicalDeviceId, revision: 0, name: 'Hybrid light', capabilities: [] };
    if (operation === 'read') f.management.getDisplayMetadataV2.mockImplementationOnce(async () => {
      f.data.sessionEpoch++; return current;
    });
    else f.management.saveDisplayMetadataV2.mockImplementationOnce(async value => {
      f.data.sessionEpoch++; return { ...value, revision: 1 };
    });
    await f.page.saveName('客厅灯');
    expect(f.data.updateDeviceV2DisplayMetadata).not.toHaveBeenCalled();
    if (operation === 'read') expect(f.management.saveDisplayMetadataV2).not.toHaveBeenCalled();
    f.page.ngOnDestroy();
  });

  it('does not let shared users edit global display metadata', async () => {
    const f = harness(); f.device.config.isShared = true;
    await f.page.saveName('Shared name'); await f.page.loadDisplayMetadata();
    expect(f.management.getDisplayMetadataV2).not.toHaveBeenCalled();
    expect(f.management.saveDisplayMetadataV2).not.toHaveBeenCalled(); f.page.ngOnDestroy();
  });

  it('fences an old form load after leaving and returning to the same device, including the new busy state', async () => {
    const f = harness();
    let resolveOld!: (value: any) => void, resolveNew!: (value: any) => void;
    f.management.getDisplayMetadataV2
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve; }));
    const oldLoad = f.page.loadDisplayMetadata();
    for (const id of ['other_device', logicalDeviceId]) {
      f.route.paramMap.next({ get: (name: string) => name === 'id' ? id : null });
    }
    const newLoad = f.page.loadDisplayMetadata();
    resolveOld({ logicalDeviceId, revision: 1, name: 'Old', capabilities: [] }); await oldLoad;
    expect(f.page.displayBusy).toBe(true);
    expect(f.data.updateDeviceV2DisplayMetadata).not.toHaveBeenCalled();
    resolveNew({ logicalDeviceId, revision: 2, name: 'New', capabilities: [
      { key: 'power', kind: 0, type: 0, displayName: '新电源名称' } ] }); await newLoad;
    expect(f.page.displayRows[0].displayName).toBe('新电源名称');
    expect(f.page.displayBusy).toBe(false); f.page.ngOnDestroy();
  });

  it('reveals and copies the current key without persisting it in the device model', async () => {
    const { page, device, management } = harness();
    const copy = vi.spyOn(page as any, 'writeClipboard').mockResolvedValue(undefined);

    await page.toggleKey();
    await page.copyKey();

    expect(management.revealDeviceKeyV2).toHaveBeenCalledWith({
      logicalDeviceId,
      credentialVersion: 1,
      locator: 'locator-v1',
    });
    expect(copy).toHaveBeenCalledWith(deviceKey);
    expect(device.deviceKey).toBeUndefined();
  });

  it('owner removal clears displayed Key but does not claim local credentials were erased', async () => {
    const { page, management, notice } = harness(); page.secretKey = deviceKey;
    management.deleteDeviceV2.mockResolvedValue({ data: { brokerCleanupPending: true, realtimeRefreshPending: false } });
    expect(await (page as any).removeOwnedDevice()).toBe(true);
    expect(page.secretKey).toBe('');
    expect(notice.showToast).toHaveBeenCalledWith('云端授权已撤销，通信清理中；本地权限尚未确认清除');
  });

  it('reports local allocation cleanup failure separately from confirmed cloud removal', async () => {
    const { page, management, notice } = harness();
    management.deleteDeviceV2.mockResolvedValue({ data: { brokerCleanupPending: false, realtimeRefreshPending: false } });
    const find = vi.spyOn(CapacitorWiFiProvAllocationStore.prototype, 'findDevice').mockRejectedValue(Error('disk'));
    try {
      expect(await (page as any).removeOwnedDevice()).toBe(true);
      expect(notice.showToast).toHaveBeenCalledWith('云端授权已撤销，本机配网记录清理未完成；重置设备后再次配网可重试清理');
    } finally { find.mockRestore(); }
  });

  it('does not let an account switch during DELETE clean native records', async () => {
    const { page, management, data } = harness();
    const find = vi.spyOn(CapacitorWiFiProvAllocationStore.prototype, 'findDevice');
    management.deleteDeviceV2.mockImplementationOnce(async () => { data.sessionEpoch++; return { data: {} }; });
    try {
      expect(await (page as any).removeOwnedDevice()).toBe(false);
      expect(find).not.toHaveBeenCalled();
    } finally { find.mockRestore(); }
  });

  it('pure BLE removal completes cloud work without claiming local erasure or requiring a Key', async () => {
    const { page, device, management, notice } = harness();
    device.deviceType = 'ble';
    device.cloudEnabled = false;
    device.credentialVersion = null;
    management.deleteDeviceV2.mockResolvedValue({ data: { brokerCleanupPending: false, realtimeRefreshPending: false } });
    expect(await (page as any).removeOwnedDevice()).toBe(true);
    expect(management.deleteDeviceV2).toHaveBeenCalledExactlyOnceWith(logicalDeviceId);
    expect(management.revealDeviceKeyV2).not.toHaveBeenCalled();
    expect(notice.showToast).toHaveBeenCalledWith('设备已从云端移除；本地权限尚未确认清除');
  });

  it.each([false, true])('distinguishes cloud owner removal from shared-member exit: shared=%s', async shared => {
    const { page, device, alerts, management } = harness();
    device.config.isShared = shared;
    (page as any).bindDevice();
    await page.showUnbindConfirm();
    const options = alerts.create.mock.calls[0][0];
    expect(options.header).toBe(shared ? '确认退出分享' : '确认移除设备');
    expect(options.buttons[1].text).toBe(shared ? '退出分享' : '移除设备');
    if (!shared) expect(options.message).toContain('仅重启或移除云端记录不代表本地权限已清除');
    expect(management.deleteDeviceV2).not.toHaveBeenCalled();
  });

  it('unsupported mixed/gateway removal does not pretend the device was removed', async () => {
    const { page, management, notice } = harness();
    management.deleteDeviceV2.mockRejectedValue(new GatewayHttpError({ httpStatus: 409,
      code: 'DEVICE_V2_REMOVAL_LOCAL_LIFECYCLE_REQUIRED', message: 'Unavailable' }));
    expect(await (page as any).removeOwnedDevice()).toBe(false);
    expect(notice.showToast).toHaveBeenCalledWith('该接入类型的移除流程尚未开放，设备未被移除');
  });

  it('does not fall back to the removed legacy deletion API', async () => {
    const { page, device, management, notice } = harness();
    device.config.mode = 'legacy';
    expect(await (page as any).removeOwnedDevice()).toBe(false);
    expect(management.deleteDeviceV2).not.toHaveBeenCalled();
    expect(notice.showToast).toHaveBeenCalledWith('当前仅支持 V2 设备移除，请先确认设备接入类型');
  });

  it('keeps one idempotency key when a rotate response must be retried', async () => {
    const { page, device, management } = harness();
    management.rotateDeviceKeyV2
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        status: 200,
        data: {
          logicalDeviceId,
          credentialVersion: 2,
          locator: 'locator-v2',
          deviceKey: 'B'.repeat(43),
        },
      });

    await page.refreshKey();
    await page.refreshKey();

    expect(management.rotateDeviceKeyV2).toHaveBeenCalledTimes(2);
    expect(management.rotateDeviceKeyV2.mock.calls[0][1]).toBe(
      management.rotateDeviceKeyV2.mock.calls[1][1],
    );
    expect(device.credentialVersion).toBe(2);
    expect(device.locator).toBe('locator-v2');
    expect(page.secretKey).toBe('B'.repeat(43));
  });

  it('requires reset confirmation and keeps the original logical device in the route', async () => {
    const { page, nav, alerts } = harness();
    expect(page.supportsWifiProvisioning).toBe(true);

    await page.startReconfigure();

    const message = alerts.create.mock.calls[0][0].message as string;
    expect(message).toContain('仅重置网络时保留 Key');
    expect(message).toContain('清除了全部接入信息');
    expect(message).toContain('刷新 Key 并重建本地权限');
    expect(message).not.toContain('不会刷新 Key');

    expect(nav.navigateForward).toHaveBeenCalledWith('/tools/esp32-provision', {
      queryParams: { mode: 'reconfigure', logicalDeviceId },
    });
  });

  it('offers gateway enrollment only for an online owner Edge Hub', async () => {
    const { page, device, nav } = harness();
    expect(page.supportsGatewayEnrollment).toBe(true);

    await page.startGatewayEnrollment();

    expect(nav.navigateForward).toHaveBeenCalledWith(
      `/device/${encodeURIComponent(logicalDeviceId)}/gateway-enrollment`,
    );
    device.deviceType = 'wifi';
    (page as any).bindDevice();
    expect(page.supportsGatewayEnrollment).toBe(false);
  });

  it('does nothing when the reset warning is cancelled', async () => {
    const { page, nav } = harness('cancel');
    expect(page.supportsWifiProvisioning).toBe(true);

    await page.startReconfigure();

    expect(nav.navigateForward).not.toHaveBeenCalled();
  });

  it('offers reconfiguration to an activated cloud device before its first cloud login', () => {
    const { page, device } = harness();
    device.cloudLastSeenAt = null;

    (page as any).bindDevice();

    expect(page.supportsWifiProvisioning).toBe(true);
  });

  it('does not offer reconfiguration before activation or without cloud capability', () => {
    const { page, device } = harness();
    device.state = 'pending';
    (page as any).bindDevice();
    expect(page.supportsWifiProvisioning).toBe(false);

    device.state = 'active';
    device.cloudEnabled = false;
    (page as any).bindDevice();
    expect(page.supportsWifiProvisioning).toBe(false);
  });

  it('binds a cold-start deep link only after the device inventory is ready', () => {
    const { page, device, data } = harness();
    data.deviceDataLoader = new BehaviorSubject(false) as any;
    data.getDevice.mockReturnValue(undefined);

    // Recreate the page with an inventory that is still loading. User profile
    // readiness is intentionally irrelevant to a device route.
    const route = {
      paramMap: new BehaviorSubject({
        get: (name: string) => name === 'id' ? logicalDeviceId : null,
      }),
    };
    const coldPage = new DeviceSettingsPage(
      route as any,
      {} as any,
      {} as any,
      data as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { isAvailable: false } as any,
      { showToast: vi.fn() } as any,
      { markForCheck: vi.fn() } as any,
    );
    coldPage.ngOnInit();
    expect(coldPage.loaded).toBe(false);

    data.getDevice.mockReturnValue(device);
    data.deviceDataLoader.next(true);

    expect(coldPage.loaded).toBe(true);
    expect(coldPage.device?.logicalDeviceId).toBe(logicalDeviceId);
    coldPage.ngOnDestroy();
    page.ngOnDestroy();
  });
});
