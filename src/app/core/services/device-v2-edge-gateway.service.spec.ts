import { EdgeGatewayTopologyState } from '../protocol/device-v2';
import { EdgeGatewayAttachRelay } from '../device-v2/edge-gateway';
import { DeviceV2EdgeGatewayService } from './device-v2-edge-gateway.service';
import { GatewayHttpError } from '../model/response.model';
import { base64UrlEncode } from '../device-v2/ble-direct';

describe('DeviceV2EdgeGatewayService recovery facade', () => {
  afterEach(() => vi.restoreAllMocks());

  const data = {
    auth: { uuid: 'account-a' },
    user: { id: 'account-a' },
    sessionEpoch: 1,
  };

  it('returns only no-secret recovery metadata for the selected Hub', async () => {
    const pendingOperation = new Uint8Array(16).fill(3);
    const otherOperation = new Uint8Array(16).fill(4);
    const pendingInstance = new Uint8Array(16).fill(5);
    const otherInstance = new Uint8Array(16).fill(6);
    const ble = {
      enrollmentCredentialState: vi.fn().mockResolvedValue('pending'),
    };
    const service = new DeviceV2EdgeGatewayService({} as any, ble as any, data as any);
    (service as any).enrollmentCheckpoints = {
      list: vi.fn().mockResolvedValue([
        { edgeHubLogicalDeviceId: 'hub-a', childLogicalDeviceId: 'ble_pending' },
        { edgeHubLogicalDeviceId: 'hub-b', childLogicalDeviceId: 'ble_wrong_hub' },
      ]),
      remove: vi.fn(),
    };
    (service as any).checkpoints = {
      list: vi.fn().mockResolvedValue([
        {
          operationId: pendingOperation,
          edgeHubLogicalDeviceId: 'hub-a',
          childLogicalDeviceId: 'ble_attaching',
          childDeviceInstanceId: pendingInstance,
        },
        {
          operationId: otherOperation,
          edgeHubLogicalDeviceId: 'hub-b',
          childLogicalDeviceId: 'ble_other',
          childDeviceInstanceId: otherInstance,
        },
      ]),
    };

    await expect(service.recoveries('hub-a')).resolves.toEqual([
      {
        id: 'attachment:AwMDAwMDAwMDAwMDAwMDAw',
        logicalDeviceId: 'ble_attaching',
        stage: 'finish_attachment',
      },
      {
        id: 'enrollment:ble_pending',
        logicalDeviceId: 'ble_pending',
        stage: 'finish_enrollment',
      },
    ]);
    expect(pendingOperation).toEqual(new Uint8Array(16));
    expect(otherOperation).toEqual(new Uint8Array(16));
    expect(pendingInstance).toEqual(new Uint8Array(16));
    expect(otherInstance).toEqual(new Uint8Array(16));
  });

  it('revalidates a pending enrollment before resuming through the chosen Hub', async () => {
    const completion = { logicalDeviceId: 'ble_pending', attachment: {} };
    const ble = {
      enrollmentCredentialState: vi.fn().mockResolvedValue('pending'),
    };
    const service = new DeviceV2EdgeGatewayService({} as any, ble as any, data as any);
    (service as any).enrollmentCheckpoints = {
      list: vi.fn().mockResolvedValue([
        { edgeHubLogicalDeviceId: 'hub-a', childLogicalDeviceId: 'ble_pending' },
      ]),
    };
    const resume = vi.fn().mockResolvedValue(completion);
    (service as any).resumeEnrollmentAndAttach = resume;
    const recovery = {
      id: 'enrollment:ble_pending',
      logicalDeviceId: 'ble_pending',
      stage: 'finish_enrollment' as const,
    };

    await expect(service.resumeRecovery('hub-a', recovery)).resolves.toBe(completion);
    expect(resume).toHaveBeenCalledWith(
      'hub-a', 'ble_pending', expect.objectContaining({ accountId: 'account-a' }),
    );
  });

  it('rejects forged or stale recovery metadata before opening a relay window', async () => {
    const ble = { enrollmentCredentialState: vi.fn() };
    const service = new DeviceV2EdgeGatewayService({} as any, ble as any, data as any);
    (service as any).enrollmentCheckpoints = {
      list: vi.fn().mockResolvedValue([]),
    };

    await expect(service.resumeRecovery('hub-a', {
      id: 'enrollment:ble_missing',
      logicalDeviceId: 'ble_missing',
      stage: 'finish_enrollment',
    })).rejects.toThrow('EDGE_GATEWAY_RECOVERY_NOT_FOUND');
    await expect(service.resumeRecovery('hub-a', {
      id: 'attachment:not-base64',
      logicalDeviceId: 'ble_missing',
      stage: 'finish_attachment',
    })).rejects.toThrow('EDGE_GATEWAY_RECOVERY_INVALID');
  });

  it('resumes an already committed child through the exact selected Hub', async () => {
    const completion = { logicalDeviceId: 'ble_active', attachment: {} };
    const ble = { enrollmentCredentialState: vi.fn().mockResolvedValue('active') };
    const service = new DeviceV2EdgeGatewayService({} as any, ble as any, data as any);
    (service as any).enrollmentCheckpoints = {
      list: vi.fn().mockResolvedValue([
        { edgeHubLogicalDeviceId: 'hub-a', childLogicalDeviceId: 'ble_active' },
      ]),
    };
    const connect = vi.fn().mockResolvedValue(completion);
    (service as any).beginAttachment = connect;

    await expect(service.resumeRecovery('hub-a', {
      id: 'enrollment:ble_active',
      logicalDeviceId: 'ble_active',
      stage: 'finish_attachment',
    })).resolves.toBe(completion);
    expect(connect).toHaveBeenCalledWith(
      'hub-a', 'ble_active', expect.objectContaining({ accountId: 'account-a' }),
    );
  });

  it('does not hold a child BLE session while Hub secret delivery is pending', async () => {
    const operationId = new Uint8Array(16).fill(3);
    const checkpoint = {
      operationId: operationId.slice(),
      edgeHubLogicalDeviceId: 'hub-a',
      childLogicalDeviceId: 'ble_active',
      childDeviceInstanceId: new Uint8Array(16).fill(5),
    };
    const connectUsing = vi.fn();
    const service = new DeviceV2EdgeGatewayService(
      {} as any, { connectUsing } as any, data as any,
    );
    (service as any).checkpoints = {
      load: vi.fn().mockResolvedValue(checkpoint),
      save: vi.fn(),
      list: vi.fn(),
      remove: vi.fn(),
    };
    const pendingTopology = {
      operationId: operationId.slice(),
      edgeHubLogicalDeviceId: 'hub-a',
      childLogicalDeviceId: 'ble_active',
      childDeviceInstanceId: checkpoint.childDeviceInstanceId.slice(),
      accessEpoch: 1,
      controllerId: new Uint8Array(16).fill(7),
      credentialVersion: 1,
      presenceKeyVersion: 1,
      topologyVersion: 1,
      topologyState: EdgeGatewayTopologyState.PendingAccessDelivery,
      credentialExpiresAt: Date.now() + 60_000,
      deliveryExpiresAt: Date.now() + 30_000,
      edgeHubStored: false,
      childInstalled: false,
      gatewayProven: false,
      updatedAt: Date.now(),
      replayed: false,
    };
    (service as any).attachApi = {
      get: vi.fn().mockResolvedValue({
        topology: pendingTopology,
      }),
      create: vi.fn().mockResolvedValue({
        topology: pendingTopology,
      }),
      // A second cloud poll would cross into child installation. The facade
      // must return the pending result, not let the phone's direct controller
      // accidentally perform that install without the selected Hub link.
      resume: vi.fn().mockResolvedValueOnce({ topology: pendingTopology })
        .mockResolvedValue({ topology: {
          ...pendingTopology, topologyState: EdgeGatewayTopologyState.PendingChildInstall,
        } }),
    };

    const result = await service.resumeRecovery('hub-a', {
      id: 'attachment:AwMDAwMDAwMDAwMDAwMDAw',
      logicalDeviceId: 'ble_active',
      stage: 'finish_attachment',
    });

    expect(result.attachment?.topology.topologyState)
      .toBe(EdgeGatewayTopologyState.PendingAccessDelivery);
    expect(connectUsing).not.toHaveBeenCalled();
    expect((service as any).attachApi.resume).toHaveBeenCalledOnce();
  });

  it('closes the enrollment session before the first cloud mutation and preserves a retry checkpoint', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const instance = new Uint8Array(16).fill(5);
    const ble = {
      credentialDeviceInstanceId: vi.fn().mockResolvedValue(instance),
      createGatewayChildControl: vi.fn(),
      connectUsing: vi.fn(),
    };
    const service = new DeviceV2EdgeGatewayService({} as any, ble as any, data as any);
    (service as any).recoverPermitJoinWindows = vi.fn().mockResolvedValue(undefined);
    let saved: any;
    (service as any).checkpoints = {
      save: vi.fn(async value => { saved = structuredClone(value); }),
      remove: vi.fn(),
    };
    (service as any).attachApi = {
      create: vi.fn(async () => {
        expect(close).toHaveBeenCalledOnce();
        expect(saved.childLogicalDeviceId).toBe('ble_active');
        throw new Error('CLOUD_RESPONSE_LOST');
      }),
    };

    await expect((service as any).attachEnrollment('hub-a', {
      logicalDeviceId: 'ble_active', session: { close },
    }, (service as any).accountContext())).rejects.toThrow('CLOUD_RESPONSE_LOST');
    expect(ble.createGatewayChildControl).not.toHaveBeenCalled();
    expect(ble.connectUsing).not.toHaveBeenCalled();
    expect((service as any).checkpoints.remove).not.toHaveBeenCalled();
    expect(saved.operationId.some(byte => byte !== 0)).toBe(true);
    expect(instance).toEqual(new Uint8Array(16));
  });

  it.each(['enrollment', 'attachment-recovery'] as const)(
    'preserves the exact checkpoint without BLE or automatic retry while %s awaits retirement', async entry => {
      const account = { auth: { uuid: 'account-a' }, user: { id: 'account-a' }, sessionEpoch: 1 };
      const close = vi.fn();
      const ble = {
        credentialDeviceInstanceId: vi.fn(async () => new Uint8Array(16).fill(5)),
        connectUsing: vi.fn(),
      };
      const service = new DeviceV2EdgeGatewayService({} as any, ble as any, account as any);
      const pending = new GatewayHttpError({ httpStatus: 409,
        code: 'EDGE_GATEWAY_RETIREMENT_PENDING', message: 'Retirement pending' });
      let saved = {
        operationId: new Uint8Array(16).fill(3), edgeHubLogicalDeviceId: 'hub-a',
        childLogicalDeviceId: 'ble_active', childDeviceInstanceId: new Uint8Array(16).fill(5),
      };
      const checkpoints = {
        save: vi.fn(async value => { saved = structuredClone(value); }),
        load: vi.fn(async () => structuredClone(saved)),
        remove: vi.fn(async id => { expect([...id]).toEqual([...saved.operationId]); }),
      };
      const api = { create: vi.fn().mockRejectedValue(pending), resume: vi.fn() };
      (service as any).checkpoints = checkpoints;
      (service as any).attachApi = api;
      (service as any).recoverPermitJoinWindows = vi.fn();
      const recover = () => service.resumeRecovery('hub-a', {
        id: `attachment:${base64UrlEncode(saved.operationId)}`,
        logicalDeviceId: 'ble_active', stage: 'finish_attachment',
      });
      const first = entry === 'enrollment'
        ? (service as any).attachEnrollment('hub-a', {
            logicalDeviceId: 'ble_active', session: { close },
          }, (service as any).accountContext())
        : recover();
      await expect(first).resolves.toEqual({ logicalDeviceId: 'ble_active', retirementPending: true });
      expect(api.create).toHaveBeenCalledOnce();
      expect(api.resume).not.toHaveBeenCalled();
      expect(ble.connectUsing).not.toHaveBeenCalled();
      expect(checkpoints.remove).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(entry === 'enrollment' ? 1 : 0);

      for (const [code, status] of [
        ['EDGE_GATEWAY_TOPOLOGY_CONFLICT', 409],
        ['EDGE_GATEWAY_IDEMPOTENCY_CONFLICT', 409],
        ['EDGE_GATEWAY_RETIREMENT_PENDING', 503],
      ] as const) {
        api.create.mockRejectedValue(new GatewayHttpError({ httpStatus: status, code, message: code }));
        await expect(recover()).rejects.toThrow(code);
      }
      api.create.mockImplementationOnce(async () => { account.sessionEpoch++; throw pending; });
      await expect(recover()).rejects.toThrow('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');

      // A fresh account context can resume the same request when the old record
      // has really retired; no second operation or credential is invented.
      const topology = { ...structuredClone(saved), topologyState: EdgeGatewayTopologyState.Active };
      (service as any).enrollmentCheckpoints = { remove: vi.fn() };
      api.create.mockImplementation(async request => {
        expect([...request.operationId]).toEqual([...saved.operationId]);
        expect([...request.childDeviceInstanceId]).toEqual([...saved.childDeviceInstanceId]);
        return { topology };
      });
      await expect(recover()).resolves.toEqual({ logicalDeviceId: 'ble_active', attachment: { topology } });
      expect(checkpoints.remove).toHaveBeenCalledOnce();
      expect(api.create.mock.calls.at(-1)?.[0].operationId.every(byte => byte === 0)).toBe(true);
      expect(saved.operationId.some(byte => byte !== 0)).toBe(true);
    },
  );

  it('keeps the recovered child session open until attachment resume settles', async () => {
    let finish!: (value: any) => void;
    const resumed = new Promise(resolve => { finish = resolve; });
    const close = vi.fn().mockResolvedValue(undefined);
    const child = {};
    const ble = {
      connectUsing: vi.fn().mockResolvedValue({
        logicalDeviceId: 'ble_active',
        session: { close },
      }),
      createGatewayChildControl: vi.fn().mockReturnValue(child),
    };
    const service = new DeviceV2EdgeGatewayService({} as any, ble as any, data as any);
    vi.spyOn(EdgeGatewayAttachRelay.prototype, 'advanceCloud').mockResolvedValue({
      topology: { topologyState: EdgeGatewayTopologyState.PendingChildInstall },
    } as any);
    const resume = vi.spyOn(EdgeGatewayAttachRelay.prototype, 'resume')
      .mockReturnValue(resumed as any);
    const checkpoint = {
      operationId: new Uint8Array(16).fill(3),
      edgeHubLogicalDeviceId: 'hub-a',
      childLogicalDeviceId: 'ble_active',
      childDeviceInstanceId: new Uint8Array(16).fill(5),
    };

    const result = (service as any).resumeAttachment(
      checkpoint, (service as any).accountContext(),
    );
    await vi.waitFor(() => expect(resume).toHaveBeenCalled());
    expect(close).not.toHaveBeenCalled();

    const completed = {
      topology: { topologyState: EdgeGatewayTopologyState.Active },
    };
    finish(completed);
    await expect(result).resolves.toBe(completed);
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(['enrollment', 'active-recovery'] as const)('uses the same cloud-first attachment path for %s', async entry => {
    const oldClose = vi.fn().mockResolvedValue(undefined);
    const freshClose = vi.fn().mockResolvedValue(undefined);
    const fresh = { logicalDeviceId: 'ble_active', session: { close: freshClose } };
    let delivered = false;
    let cloudRequest: any;
    const ble = {
      credentialDeviceInstanceId: vi.fn().mockResolvedValue(new Uint8Array(16).fill(5)),
      enrollmentCredentialState: vi.fn().mockResolvedValue('active'),
      connectUsing: vi.fn(async () => {
        expect(delivered).toBe(true);
        expect(oldClose).toHaveBeenCalledTimes(entry === 'enrollment' ? 1 : 0);
        return fresh;
      }),
      createGatewayChildControl: vi.fn().mockReturnValue({}),
    };
    const service = new DeviceV2EdgeGatewayService({} as any, ble as any, data as any);
    (service as any).recoverPermitJoinWindows = vi.fn().mockResolvedValue(undefined);
    (service as any).checkpoints = { save: vi.fn(), remove: vi.fn() };
    (service as any).enrollmentCheckpoints = {
      list: vi.fn().mockResolvedValue([{ edgeHubLogicalDeviceId: 'hub-a', childLogicalDeviceId: 'ble_active' }]),
    };
    (service as any).attachApi = {
      create: vi.fn(async request => {
        expect(oldClose).toHaveBeenCalledTimes(entry === 'enrollment' ? 1 : 0);
        expect(ble.connectUsing).not.toHaveBeenCalled();
        cloudRequest = request;
        return { topology: { ...request, topologyState: EdgeGatewayTopologyState.PendingAccessDelivery } };
      }),
      resume: vi.fn(async () => {
        delivered = true;
        return { topology: { ...cloudRequest, topologyState: EdgeGatewayTopologyState.PendingChildInstall } };
      }),
    };
    const completed = { topology: { topologyState: EdgeGatewayTopologyState.Active } };
    vi.spyOn(EdgeGatewayAttachRelay.prototype, 'resume').mockImplementation(async () => {
      expect(ble.createGatewayChildControl).toHaveBeenCalledWith(fresh, expect.any(Function));
      expect(freshClose).not.toHaveBeenCalled();
      return completed as any;
    });

    const result = entry === 'enrollment'
      ? await (service as any).attachEnrollment('hub-a', {
          logicalDeviceId: 'ble_active', session: { close: oldClose },
        }, (service as any).accountContext())
      : await service.resumeRecovery('hub-a', {
          id: 'enrollment:ble_active', logicalDeviceId: 'ble_active', stage: 'finish_attachment',
        });

    expect(result.attachment).toBe(completed);
    expect(ble.connectUsing).toHaveBeenCalledOnce();
    expect(freshClose).toHaveBeenCalledOnce();
  });

  it('does not start cloud attachment if the account changes while closing enrollment', async () => {
    const account = { auth: { uuid: 'account-a' }, user: { id: 'account-a' }, sessionEpoch: 1 };
    const ble = { credentialDeviceInstanceId: vi.fn() };
    const service = new DeviceV2EdgeGatewayService({} as any, ble as any, account as any);
    const context = (service as any).accountContext();
    const close = vi.fn(async () => { account.sessionEpoch++; });
    await expect((service as any).attachEnrollment('hub-a', {
      logicalDeviceId: 'ble_active', session: { close },
    }, context)).rejects.toThrow('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
    expect(close).toHaveBeenCalledOnce();
    expect(ble.credentialDeviceInstanceId).not.toHaveBeenCalled();
  });

  it('rejects an in-flight response after account switch and clears relay material', async () => {
    const account = {
      auth: { uuid: 'account-a' },
      user: { id: 'account-a' },
      sessionEpoch: 1,
    };
    const service = new DeviceV2EdgeGatewayService({} as any, {} as any, account as any);
    let finish!: (value: any) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    (service as any).attachApi = { get: vi.fn().mockReturnValue(pending) };
    const context = (service as any).accountContext();
    const operationId = new Uint8Array(16).fill(0x11);
    const result = {
      topology: {
        operationId: operationId.slice(),
        childDeviceInstanceId: new Uint8Array(16).fill(0x22),
        controllerId: new Uint8Array(16).fill(0x33),
      },
      relay: {
        grantId: new Uint8Array(16).fill(0x44),
        controllerId: new Uint8Array(16).fill(0x55),
        exactGrant: new Uint8Array(32).fill(0x66),
        gatewaySecret: new Uint8Array(32).fill(0x77),
      },
    };
    const request = (service as any).accountAttachApi(context).get(operationId);

    account.auth = { uuid: 'account-b' };
    account.user = { id: 'account-b' };
    account.sessionEpoch = 2;
    finish(result);

    await expect(request).rejects.toThrow('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
    expect(result.relay.gatewaySecret).toEqual(new Uint8Array(32));
    expect(result.relay.exactGrant).toEqual(new Uint8Array(32));
    expect(result.topology.operationId).toEqual(new Uint8Array(16));
  });

  it('clears an in-flight permit relay response after account switch', async () => {
    const account = {
      auth: { uuid: 'account-a' },
      user: { id: 'account-a' },
      sessionEpoch: 1,
    };
    const service = new DeviceV2EdgeGatewayService({} as any, {} as any, account as any);
    let finish!: (value: any) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    (service as any).permitJoin = { readRelay: vi.fn().mockReturnValue(pending) };
    const context = (service as any).accountContext();
    const operationId = new Uint8Array(16).fill(0x11);
    const result = {
      operationId: operationId.slice(),
      relaySessionId: new Uint8Array(16).fill(0x22),
      revision: 1,
      candidateSnapshot: new Uint8Array(8).fill(0x33),
      selectResult: new Uint8Array(8).fill(0x44),
      downAck: new Uint8Array(8).fill(0x55),
      upstreamBatch: new Uint8Array(8).fill(0x66),
      expiresAt: Date.now() + 60_000,
    };
    const request = (service as any).accountPermitJoinApi(context).readRelay(operationId);

    account.auth = { uuid: 'account-b' };
    account.user = { id: 'account-b' };
    account.sessionEpoch = 2;
    finish(result);

    await expect(request).rejects.toThrow('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
    expect(result.operationId).toEqual(new Uint8Array(16));
    expect(result.relaySessionId).toEqual(new Uint8Array(16));
    expect(result.upstreamBatch).toEqual(new Uint8Array(8));
  });

  it('disconnects a consumed enrollment workflow when it is cancelled', async () => {
    let rejectEnrollment!: (error: Error) => void;
    const pendingEnrollment = new Promise((_resolve, reject) => {
      rejectEnrollment = reject;
    });
    const disconnect = vi.fn().mockImplementation(async () => {
      rejectEnrollment(new Error('EDGE_GATEWAY_PERMIT_JOIN_DISCONNECTED'));
    });
    const candidate = {
      device: { deviceId: 'gateway:candidate' },
      profile: { modeLocator: new Uint8Array(8).fill(7) },
    };
    const ble = { enrollUsing: vi.fn().mockReturnValue(pendingEnrollment) };
    const service = new DeviceV2EdgeGatewayService({} as any, ble as any, data as any);
    (service as any).recoverPermitJoinWindows = vi.fn().mockResolvedValue(undefined);
    (service as any).permitJoinLink = vi.fn().mockReturnValue({
      discoverProvisioningDevices: vi.fn().mockResolvedValue([candidate]),
      disconnect,
    });
    const workflow = await service.beginEnrollment('hub-a');
    const enrolling = workflow.enrollAndAttach(candidate as any, { displayName: 'child' });
    await vi.waitFor(() => expect(ble.enrollUsing).toHaveBeenCalledOnce());

    await workflow.cancel();

    expect(disconnect).toHaveBeenCalledOnce();
    await expect(enrolling).rejects.toThrow('EDGE_GATEWAY_PERMIT_JOIN_DISCONNECTED');
  });
});
