import { BehaviorSubject, Subject } from 'rxjs';

import { GatewayHttpError } from '../../../core/model/response.model';
import { EdgeGatewayTopologyState } from '../../../core/protocol/device-v2';
import { EdgeGatewayEnrollmentPage } from './edge-gateway-enrollment.page';

describe('EdgeGatewayEnrollmentPage', () => {
  const hubId = 'device_edge_hub';
  const childId = 'ble_child';

  function harness() {
    const hub: any = {
      deviceName: hubId,
      deviceType: 'edge-hub',
      config: { customName: '客厅网关', isShared: false },
    };
    const data = {
      auth: { accessToken: 'token' },
      sessionEpoch: 1,
      authDataChanged: new Subject<void>(),
      deviceDataLoader: new BehaviorSubject(true),
      getDevice: vi.fn(() => hub),
    };
    const gateway = {
      beginEnrollment: vi.fn(),
      recoveries: vi.fn().mockResolvedValue([]),
      resumeRecovery: vi.fn(),
    };
    const route = {
      paramMap: new BehaviorSubject({ get: (name: string) => name === 'id' ? hubId : null }),
    };
    const nav = {
      navigateRoot: vi.fn().mockResolvedValue(true),
    };
    const page = new EdgeGatewayEnrollmentPage(
      route as any,
      data as any,
      gateway as any,
      { getAllInfo: vi.fn().mockResolvedValue(true) } as any,
      nav as any,
      { markForCheck: vi.fn() } as any,
    );
    return { page, hub, data, gateway, nav };
  }

  it('always asks the user to select an exact relay candidate', async () => {
    const { page, gateway } = harness();
    const candidates = [
      { device: { deviceId: 'gateway:one' }, profile: { modeLocator: new Uint8Array(8).fill(1) }, rssi: -40 },
      { device: { deviceId: 'gateway:two' }, profile: { modeLocator: new Uint8Array(8).fill(2) }, rssi: -60 },
    ];
    const enrollAndAttach = vi.fn();
    gateway.beginEnrollment.mockResolvedValue({
      candidates,
      enrollAndAttach,
      cancel: vi.fn(),
    });

    await page.startDiscovery();

    expect(page.phase).toBe('selecting');
    expect(page.candidates).toEqual(candidates);
    expect(enrollAndAttach).not.toHaveBeenCalled();
  });

  it('turns an expired permit-join relay into a retryable user message', async () => {
    const { page, gateway } = harness();
    const target = {
      device: { deviceId: 'gateway:expired' },
      profile: { modeLocator: new Uint8Array(8).fill(1) },
      rssi: -40,
    };
    gateway.beginEnrollment.mockResolvedValue({
      candidates: [target],
      enrollAndAttach: vi.fn().mockRejectedValue(new GatewayHttpError({
        httpStatus: 409,
        code: 'EDGE_GATEWAY_PERMIT_JOIN_RELAY_NOT_READY',
        message: 'permit-join window is not ready for enrollment relay',
      })),
      cancel: vi.fn(),
    });

    await page.startDiscovery();
    await page.selectCandidate(target as any);

    expect(page.phase).toBe('failed');
    expect(page.error).toBe('设备接入窗口已失效，请重新扫描');
  });

  it('does not expose raw Gateway service errors to the user', async () => {
    const { page, gateway } = harness();
    gateway.beginEnrollment.mockRejectedValue(new GatewayHttpError({
      httpStatus: 503,
      code: 'EDGE_GATEWAY_PERMIT_JOIN_UNAVAILABLE',
      message: 'internal shard transport failed',
    }));

    await page.startDiscovery();

    expect(page.phase).toBe('failed');
    expect(page.error).toBe('接入失败，请确认网关和蓝牙设备均在线');
  });

  it('resumes a selected no-secret recovery item through the exact Hub', async () => {
    const { page, gateway } = harness();
    const recovery = {
      id: 'enrollment:ble_child',
      logicalDeviceId: childId,
      stage: 'finish_enrollment' as const,
    };
    gateway.resumeRecovery.mockResolvedValue({
      logicalDeviceId: childId,
      attachment: {
        topology: { topologyState: EdgeGatewayTopologyState.Active },
      },
    });

    await page.resume(recovery);

    expect(gateway.resumeRecovery).toHaveBeenCalledWith(hubId, recovery);
    expect(page.phase).toBe('ready');
    expect(page.logicalDeviceId).toBe(childId);
  });

  it('does not expose enrollment on a shared or non-Hub device', () => {
    const { page, hub } = harness();
    hub.config.isShared = true;
    (page as any).bindHub();
    expect(page.available).toBe(false);

    hub.config.isShared = false;
    hub.deviceType = 'wifi';
    (page as any).bindHub();
    expect(page.available).toBe(false);
  });

  it('shows retirement waiting without a fake topology and continues the same checkpoint', async () => {
    const { page, gateway } = harness();
    const recovery = { id: 'attachment:operation', logicalDeviceId: childId, stage: 'finish_attachment' as const };
    gateway.recoveries.mockResolvedValue([recovery]);
    gateway.resumeRecovery.mockResolvedValue({ logicalDeviceId: childId, retirementPending: true });
    await page.resume(recovery);
    expect(page.phase).toBe('waiting');
    expect(page.retirementPending).toBe(true);
    expect(page.error).toBe('');
    gateway.resumeRecovery.mockResolvedValue({ logicalDeviceId: childId,
      attachment: { topology: { topologyState: EdgeGatewayTopologyState.Active } } });
    await page.continueWaiting();
    expect(gateway.resumeRecovery).toHaveBeenLastCalledWith(hubId, recovery);
    expect(page.phase).toBe('ready');
    expect(page.retirementPending).toBe(false);
  });

  it('cancels the exact Hub workflow and leaves its page when the account changes', async () => {
    const { page, data, gateway, nav } = harness();
    const cancel = vi.fn().mockResolvedValue(undefined);
    gateway.beginEnrollment.mockResolvedValue({
      candidates: [{
        device: { deviceId: 'gateway:one' },
        profile: { modeLocator: new Uint8Array(8).fill(1) },
      }],
      enrollAndAttach: vi.fn(),
      cancel,
    });
    await page.startDiscovery();

    data.auth = { accessToken: 'account-b-token' };
    data.sessionEpoch += 1;
    data.authDataChanged.next();

    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(page.candidates).toEqual([]);
    expect(page.recoveries).toEqual([]);
    expect(page.hub).toBeUndefined();
    expect(nav.navigateRoot).toHaveBeenCalledWith('/home/device');
  });

  it('returns to login and clears the workflow on logout', async () => {
    const { page, data, gateway, nav } = harness();
    const cancel = vi.fn().mockResolvedValue(undefined);
    gateway.beginEnrollment.mockResolvedValue({
      candidates: [{
        device: { deviceId: 'gateway:one' },
        profile: { modeLocator: new Uint8Array(8).fill(1) },
      }],
      enrollAndAttach: vi.fn(),
      cancel,
    });
    await page.startDiscovery();

    data.auth = null as any;
    data.sessionEpoch += 1;
    data.authDataChanged.next();

    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(nav.navigateRoot).toHaveBeenCalledWith('/login');
  });
});
