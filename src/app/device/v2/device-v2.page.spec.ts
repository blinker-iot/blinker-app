import '@angular/compiler';

import { BehaviorSubject, Subject } from 'rxjs';

import {
  DeviceUiEndpoint,
  DeviceUiEvent,
  DeviceUiSnapshot,
  DeviceUiTelemetryLease,
  DeviceUiTelemetrySnapshot,
} from '../../core/device-v2/device-ui.port';
import { BlinkerDevice } from '../../core/model/device.model';
import { generateDefaultPageLayout } from '../../core/device-v2/page-layout';
import { DeviceV2Page } from './device-v2.page';

const logicalDeviceId = 'device_11111111-1111-4111-8111-111111111111';

function endpoint(overrides: Partial<DeviceUiEndpoint>): DeviceUiEndpoint {
  return {
    id: 1,
    key: 'power',
    role: 'property',
    valueType: 'boolean',
    readable: true,
    writable: true,
    notifies: true,
    ...overrides,
  };
}

function snapshot(power = false): DeviceUiSnapshot {
  return {
    manifestRevision: 2,
    manifestFingerprint: '00'.repeat(32),
    manifestAccepted: true,
    stateRevision: 7,
    stateFresh: true,
    endpoints: [
      endpoint({ value: power }),
      endpoint({
        id: 2,
        key: 'level',
        valueType: 'integer',
        value: 12,
        minimum: 0,
        maximum: 100,
        step: 1,
      }),
      endpoint({ id: 3, key: 'label', valueType: 'text', value: 'desk' }),
      endpoint({
        id: 4,
        key: 'restart',
        role: 'action',
        valueType: 'null',
        readable: false,
        value: null,
      }),
    ],
  };
}

function device(): BlinkerDevice {
  return {
    id: logicalDeviceId,
    deviceName: logicalDeviceId,
    deviceType: 'diy',
    config: {
      broker: 'blinker',
      customName: 'Test device',
      mode: 'mqtt',
    },
    data: {},
    storage: {},
    subject: { subscribe: vi.fn() } as any,
  };
}

function harness(
  initial = snapshot(),
  pageLayouts?: any,
  openTelemetry?: () => Promise<DeviceUiTelemetryLease>,
) {
  const state = new BehaviorSubject(initial);
  const events = new Subject<DeviceUiEvent>();
  const appActive = new BehaviorSubject(true);
  const telemetry = new BehaviorSubject<DeviceUiTelemetrySnapshot>({
    active: true,
    effectiveIntervalMs: 1000,
    values: {},
  });
  const connectionState = new BehaviorSubject<
    'idle' | 'connecting' | 'ready' | 'retrying' | 'stopped'
  >('ready');
  const telemetryLease = {
    get snapshot(): DeviceUiTelemetrySnapshot {
      return telemetry.value;
    },
    subscribe: vi.fn((listener: (value: DeviceUiTelemetrySnapshot) => void) => {
      const subscription = telemetry.subscribe(listener);
      return () => subscription.unsubscribe();
    }),
    setVisible: vi.fn(async (visible: boolean) => {
      telemetry.next({ ...telemetry.value, active: visible, values: {} });
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const port = {
    appActive: appActive.asObservable(),
    connectionState,
    watchConnection: vi.fn(() => connectionState.asObservable()),
    watchState: vi.fn(() => state.asObservable()),
    watchEvents: vi.fn(() => events.asObservable()),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn().mockResolvedValue(undefined),
    openTelemetry: vi.fn(openTelemetry ?? (async () => telemetryLease)),
  };
  const localPageLayouts = pageLayouts ?? {
    get: vi.fn().mockResolvedValue(null),
    saveCandidate: vi.fn(async (_id, candidate, _endpoints, expectedRevision) => ({
      logicalDeviceId,
      revision: expectedRevision + 1,
      manifestFingerprint: candidate.manifestFingerprint,
      layout: { ...candidate, revision: expectedRevision + 1 },
      createdAt: 0,
      updatedAt: 0,
    })),
  };
  const page = new DeviceV2Page(port as any, localPageLayouts);
  page.device = device();
  page.ngOnInit();
  return { page, port, state, events, appActive, telemetry, telemetryLease };
}

describe('DeviceV2Page UI port lifecycle', () => {
  it('renders UI state and sends typed commands for the basic controls', async () => {
    const { page, port, state, events } = harness();
    await Promise.resolve();

    expect(port.connect).toHaveBeenCalledWith(logicalDeviceId);
    expect(page.widgets.map(widget => widget.type)).toEqual(['switch', 'slider', 'input', 'button']);
    const fields = page.widgets.map(widget => page.endpoint(widget)!);

    await page.setBoolean(fields[0], { detail: { checked: true } } as CustomEvent);
    await page.setSlider(fields[1], { detail: { value: 42 } } as CustomEvent);
    page.updateDraft(fields[2], { detail: { value: 'lamp' } } as CustomEvent);
    await page.commit(fields[2]);
    await page.execute(fields[3]);

    expect(port.sendCommand.mock.calls).toEqual([
      [logicalDeviceId, 'power', true],
      [logicalDeviceId, 'level', 42],
      [logicalDeviceId, 'label', 'lamp'],
      [logicalDeviceId, 'restart', null],
    ]);

    state.next(snapshot(true));
    expect(page.value(page.endpoint(page.widgets[0])!)).toBe(true);
    events.next({ logicalDeviceId, values: { power: true } });
    expect(page.lastEventText).toBe('power: true');
  });

  it('surfaces synchronization failure and retries when the account reconnects', async () => {
    const { page, port } = harness();
    port.connect.mockRejectedValueOnce(new Error('connection lost'));
    page.device = { ...device(), deviceName: logicalDeviceId.replace(/1/g, '2') };
    page.ngOnChanges({} as any);
    await vi.waitFor(() => expect(page.error).toContain('connection lost'));

    port.connectionState.next('ready');
    await vi.waitFor(() => {
      expect(port.connect).toHaveBeenCalledTimes(3);
      expect(page.error).toBe('');
    });
  });

  it('detaches page subscriptions without stopping the shared account connection', () => {
    const { page, state, events } = harness();
    page.ngOnDestroy();
    expect(state.observed).toBe(false);
    expect(events.observed).toBe(false);
  });

  it('opens realtime fields only while the page is visible and releases the lease', async () => {
    const realtime = snapshot();
    realtime.endpoints.push(endpoint({
      id: 5,
      key: 'temperature',
      valueType: 'number',
      value: 20,
      writable: false,
      telemetryMinimumIntervalMs: 250,
    }));
    const { page, port, appActive, telemetry, telemetryLease } = harness(realtime);

    await vi.waitFor(() => expect(port.openTelemetry).toHaveBeenCalledWith(
      logicalDeviceId,
      ['temperature'],
      1000,
    ));
    telemetry.next({
      active: true,
      effectiveIntervalMs: 1000,
      values: { temperature: 21.5 },
    });
    const field = page.snapshot.endpoints.find(candidate => candidate.key === 'temperature')!;
    expect(page.value(field)).toBe(21.5);

    page.ionViewDidLeave();
    await vi.waitFor(() => expect(telemetryLease.setVisible).toHaveBeenCalledWith(false));
    expect(page.value(field)).toBe(20);

    appActive.next(false);
    appActive.next(true);
    expect(telemetryLease.setVisible.mock.calls.some(call => call[0] === true)).toBe(false);

    page.ionViewDidEnter();
    await vi.waitFor(() => expect(telemetryLease.setVisible).toHaveBeenCalledWith(true));
    appActive.next(false);
    await vi.waitFor(() => expect(telemetryLease.setVisible).toHaveBeenLastCalledWith(false));
    appActive.next(true);
    await vi.waitFor(() => expect(telemetryLease.setVisible).toHaveBeenLastCalledWith(true));
    port.connectionState.next('retrying');
    await vi.waitFor(() => expect(telemetryLease.close).toHaveBeenCalledOnce());
    port.connectionState.next('ready');
    await vi.waitFor(() => expect(port.openTelemetry).toHaveBeenCalledTimes(2));
    page.ngOnDestroy();
    expect(telemetryLease.close).toHaveBeenCalledTimes(2);
    expect(telemetry.observed).toBe(false);
  });

  it('closes an in-flight open when the page leaves and opens a fresh lease on return', async () => {
    const realtime = snapshot();
    realtime.endpoints.push(endpoint({
      id: 5,
      key: 'temperature',
      valueType: 'number',
      writable: false,
      telemetryMinimumIntervalMs: 1000,
    }));
    let resolveOpen!: (lease: DeviceUiTelemetryLease) => void;
    const pendingOpen = new Promise<DeviceUiTelemetryLease>(resolve => resolveOpen = resolve);
    const result = harness(realtime, undefined, () => pendingOpen);

    await vi.waitFor(() => expect(result.port.openTelemetry).toHaveBeenCalledOnce());
    result.page.ionViewDidLeave();
    resolveOpen(result.telemetryLease);
    await vi.waitFor(() => expect(result.telemetryLease.close).toHaveBeenCalledOnce());

    result.page.ionViewDidEnter();
    await vi.waitFor(() => expect(result.port.openTelemetry).toHaveBeenCalledTimes(2));
    result.page.ngOnDestroy();
  });

  it('keeps a stale cloud layout as a migration preview until the user accepts it', async () => {
    const current = snapshot();
    const oldSnapshot = {
      ...current,
      manifestRevision: 1,
      manifestFingerprint: '11'.repeat(32),
      endpoints: [current.endpoints[0]],
    };
    const oldLayout = { ...generateDefaultPageLayout(oldSnapshot), revision: 4 };
    const get = vi.fn().mockResolvedValue({
      logicalDeviceId,
      revision: 4,
      manifestFingerprint: oldLayout.manifestFingerprint,
      layout: oldLayout,
      createdAt: 1000,
      updatedAt: 1001,
    });
    const saveCandidate = vi.fn(async (_id, candidate) => ({
      logicalDeviceId,
      revision: 5,
      manifestFingerprint: candidate.manifestFingerprint,
      layout: { ...candidate, revision: 5 },
      createdAt: 1000,
      updatedAt: 1002,
    }));
    const { page } = harness(current, { get, saveCandidate });

    await vi.waitFor(() => expect(page.layoutStale).toBeDefined());
    expect(page.layout?.widgets.map(widget => widget.endpointKey))
      .toEqual(['power', 'level', 'label', 'restart']);
    expect(page.layoutStaleText).toContain('3 个能力待加入');

    await page.updateLayout();
    expect(saveCandidate).toHaveBeenCalledWith(
      logicalDeviceId,
      expect.objectContaining({ manifestFingerprint: current.manifestFingerprint }),
      current.endpoints,
      4,
    );
    expect(page.layoutStale).toBeUndefined();
    expect(page.layout?.revision).toBe(5);
  });
});
