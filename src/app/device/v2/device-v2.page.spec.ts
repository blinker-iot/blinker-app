import '@angular/compiler';

import { SimpleChange, SimpleChanges } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import {
  DeviceUiConnectivitySnapshot,
  DeviceUiEndpoint,
  DeviceUiEvent,
  DeviceUiSnapshot,
  DeviceUiTelemetryLease,
  DeviceUiTelemetrySnapshot,
} from '../../core/device-v2/device-ui.port';
import { BlinkerDevice } from '../../core/model/device.model';
import { generateDefaultPageLayout } from '../../core/device-v2/page-layout';
import { DeviceUiConnectionScope } from '../../core/device-v2/connection-scope';
import { DeviceV2Page } from './device-v2.page';

const logicalDeviceId = 'device_11111111-1111-4111-8111-111111111111';

function changed(input: string): SimpleChanges {
  return { [input]: new SimpleChange(undefined, undefined, false) };
}

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
  viewActive = true,
  legacyRecords: any[] = [],
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
    'idle' | 'scanning' | 'nearby' | 'connecting' | 'ready' | 'retrying' | 'stopped'
  >('ready');
  const connectivity = new BehaviorSubject<DeviceUiConnectivitySnapshot>({
    activeTransport: 'ble',
    directConnectAllowed: true,
    bleAccess: true,
    bleAdapterEnabled: true,
    bleState: 'ready',
    cloudSessionState: 'idle',
  });
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
    isBleDirect: vi.fn(() => true),
    appActive: appActive.asObservable(),
    connectionState,
    watchConnection: vi.fn(() => connectionState.asObservable()),
    watchConnectivity: vi.fn(() => connectivity.asObservable()),
    watchState: vi.fn(() => state.asObservable()),
    watchEvents: vi.fn(() => events.asObservable()),
    connect: vi.fn().mockResolvedValue(undefined),
    openConnection: vi.fn((id: string, signal: AbortSignal) => {
      // Keep the existing controllable read mock while exercising the real
      // lifetime object, including cancellation AFTER the read has finished.
      const task = port.connect(id, signal);
      return new DeviceUiConnectionScope(() => task, signal);
    }),
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
  const page = new DeviceV2Page(port as any, localPageLayouts, { load: vi.fn(async () => legacyRecords) } as any);
  page.device = device();
  page.viewActive = viewActive;
  page.ngOnInit();
  return { page, port, state, events, appActive, connectivity, telemetry, telemetryLease };
}

describe('DeviceV2Page UI port lifecycle', () => {
  it('preserves an imported old layout instead of writing default controls', async () => {
    const pageLayouts = { get: vi.fn(async () => null), saveCandidate: vi.fn() };
    const source = {
      sourceCollection: 'devices', sourceId: 'a'.repeat(24), logicalDeviceId,
      snapshot: { deviceName: 'old', displayName: 'Lamp', layout: { format: 'layouter', data: { version: '2.0.0' } } },
    };
    const { page } = harness(snapshot(), pageLayouts, undefined, true, [source]);
    await vi.waitFor(() => expect(page.legacyRecord).toEqual(source));
    expect(page.widgets).toEqual([]);
    expect(pageLayouts.saveCandidate).not.toHaveBeenCalled();
    page.ngOnDestroy();
  });

  it('does not clear a layout-fetch failure just because another State arrives', async () => {
    const layouts = { get: vi.fn().mockRejectedValue(Error('LAYOUT_FETCH_FAILED')), saveCandidate: vi.fn() };
    const { page, state } = harness(snapshot(), layouts);
    await vi.waitFor(() => expect(page.error).toBe('LAYOUT_FETCH_FAILED'));
    state.next(snapshot(true));
    expect(page.error).toBe('LAYOUT_FETCH_FAILED');
    page.ngOnDestroy();
  });
  it.each([false, true])('recovers a corrupt schema preview without clearing unrelated errors (%s)', async unrelated => {
    const { page, state } = harness();
    await vi.waitFor(() => expect((page as any).storedLayout).toBeDefined());
    const valid = snapshot();
    state.next({ ...valid, endpoints: valid.endpoints.map(f => f.id === 1 ? { ...f, key: 'corrupt' } : f) });
    expect(page.error).toContain('incompatible');
    if (unrelated) page.error = 'UNRELATED_FAILURE';
    state.next(valid);
    expect(page.layout?.widgets.some(w => w.endpointKey === 'power')).toBe(true);
    expect(page.error).toBe(unrelated ? 'UNRELATED_FAILURE' : '');
    page.ngOnDestroy();
  });

  it('validates a delayed layout against the current verified schema, not the stale preview', async () => {
    const valid = snapshot(), preview = { ...valid, stateFresh: false,
      endpoints: valid.endpoints.map(f => f.id === 1 ? { ...f, key: 'corrupt' } : f) };
    let finish!: (record: unknown) => void;
    const layouts = { get: vi.fn(() => new Promise(resolve => { finish = resolve; })), saveCandidate: vi.fn() };
    const { page, state } = harness(preview, layouts);
    state.next(valid);
    finish({ logicalDeviceId, revision: 1, manifestFingerprint: valid.manifestFingerprint,
      layout: generateDefaultPageLayout(valid), createdAt: 0, updatedAt: 0 });
    await vi.waitFor(() => expect((page as any).storedLayout).toBeDefined());
    expect(page.error).toBe('');
    expect(page.layout?.widgets.some(w => w.endpointKey === 'power')).toBe(true);
    expect(layouts.saveCandidate).not.toHaveBeenCalled();
    page.ngOnDestroy();
  });
  it.each(['ready', 'failed', 'hidden', 'background', 'destroyed'])('retains the ready page scope while replacement is %s', async outcome => {
    const { page, port, appActive } = harness();
    await vi.waitFor(() => expect(page.canControl).toBe(true));
    const original = port.openConnection.mock.results.at(-1)!.value;
    let resolve!: () => void, reject!: (reason: Error) => void;
    port.connect.mockImplementationOnce(() => new Promise<void>((yes, no) => { resolve = yes; reject = no; }));
    page.retry();
    await vi.waitFor(() => expect(resolve).toBeDefined());
    const candidate = port.openConnection.mock.results.at(-1)!.value;
    try {
      expect(original.signal.aborted).toBe(false); expect(page.canControl).toBe(true);
      if (outcome === 'hidden') page.viewActive = false;
      if (outcome === 'background') appActive.next(false);
      if (outcome === 'destroyed') page.ngOnDestroy();
      if (['hidden', 'background', 'destroyed'].includes(outcome)) {
        expect(original.signal.aborted).toBe(true); expect(candidate.signal.aborted).toBe(true);
      }
      if (outcome === 'failed') reject(Error('CANDIDATE_FAILED')); else resolve();
      await vi.waitFor(() => expect((page as any).syncing).toBeUndefined());
      expect(page.canControl).toBe(outcome === 'ready' || outcome === 'failed');
      expect(original.signal.aborted).toBe(outcome !== 'failed');
      expect(candidate.signal.aborted).toBe(outcome !== 'ready');
      expect(port.sendCommand).not.toHaveBeenCalled();
    } finally { resolve(); page.ngOnDestroy(); }
  });

  it.each(['cloud', 'lan'] as const)('uses fresh selected %s readiness, not unknown inventory presence', async activeTransport => {
    const { page, port, connectivity, state } = harness();
    port.isBleDirect.mockReturnValue(false);
    connectivity.next({ ...connectivity.value, activeTransport, cloudSessionState: 'ready' });
    page.device.data.cloudReachable = null;
    await vi.waitFor(() => expect(page.canControl).toBe(true));
    await page.setBoolean(page.snapshot.endpoints[0]!, { detail: { checked: true } } as CustomEvent);
    expect(port.sendCommand).toHaveBeenCalledOnce();
    // Inventory becoming online cannot re-enable a stale live snapshot.
    page.device.data.cloudReachable = true;
    state.next({ ...snapshot(), stateFresh: false });
    expect(page.canControl).toBe(false);
    await page.execute(page.snapshot.endpoints[3]!);
    expect(port.sendCommand).toHaveBeenCalledOnce();
    state.next(snapshot()); port.connectionState.next('retrying');
    expect(page.canControl).toBe(false);
    page.ngOnDestroy();
  });
  it('cancels pending acquisition synchronously when hidden, before the next change-detection pass', async () => {
    const { page, port } = harness();
    await vi.waitFor(() => expect(page.canControl).toBe(true));
    page.viewActive = false; page.ngOnChanges(changed('viewActive'));
    let ready!: () => void;
    port.connect.mockImplementationOnce(() => new Promise<void>(resolve => { ready = resolve; }));
    page.viewActive = true; page.ngOnChanges(changed('viewActive'));
    const signal = port.connect.mock.lastCall![1] as AbortSignal;
    try {
      page.viewActive = false; // ComponentRef.setInput writes now; ngOnChanges may run later.
      expect(signal.aborted).toBe(true);
      ready(); await Promise.resolve(); await Promise.resolve();
      expect(page.canControl).toBe(false);
      expect(port.sendCommand).not.toHaveBeenCalled();
    } finally { ready(); page.ngOnDestroy(); }
  });

  it.each(['hidden', 'background', 'destroyed'])('releases the persistent scope after readiness on %s', async reason => {
    const { page, port, appActive } = harness();
    await vi.waitFor(() => expect(page.canControl).toBe(true));
    const connection = port.openConnection.mock.results.at(-1)!.value;
    const close = vi.spyOn(connection, 'close');
    expect(close).not.toHaveBeenCalled();
    if (reason === 'hidden') { page.viewActive = false; page.ngOnChanges(changed('viewActive')); }
    if (reason === 'background') appActive.next(false);
    if (reason === 'destroyed') page.ngOnDestroy();
    await connection.closed;
    expect(close).toHaveBeenCalled();
    expect(page.canControl).toBe(false);
    expect(port.disconnect).not.toHaveBeenCalled(); // Never cancels another page's owner.
    if (reason !== 'destroyed') page.ngOnDestroy();
  });

  it('a retired ready scope disables control without replaying an Action; new ready opens a new scope', async () => {
    const { page, port } = harness();
    await vi.waitFor(() => expect(page.canControl).toBe(true));
    const old = port.openConnection.mock.results.at(-1)!.value;
    old.close();
    expect(page.canControl).toBe(false); // Synchronous fence, before Promise observers run.
    await old.closed; await Promise.resolve();
    expect(page.canControl).toBe(false);
    await page.execute(page.endpoint(page.widgets[3])!);
    expect(port.sendCommand).not.toHaveBeenCalled();
    port.connectionState.next('ready');
    await vi.waitFor(() => expect(page.canControl).toBe(true));
    expect(port.openConnection.mock.results.at(-1)!.value).not.toBe(old);
    page.ngOnDestroy();
  });
  it.each(['hidden', 'background', 'destroyed'])('cancels a read wait on %s and never sends a captured Action later', async reason => {
    const { page, port, appActive } = harness();
    await vi.waitFor(() => expect(page.canControl).toBe(true));
    let release!: () => void;
    port.connect.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    page.viewActive = false; page.ngOnChanges(changed('viewActive'));
    page.viewActive = true; page.ngOnChanges(changed('viewActive'));
    const signal = port.connect.mock.lastCall![1] as AbortSignal;
    expect(page.canControl).toBe(false);
    expect(page.stateLabel).toBe('正在连接并同步');
    await page.execute(page.endpoint(page.widgets[3])!);
    expect(port.sendCommand).not.toHaveBeenCalled();
    if (reason === 'hidden') { page.viewActive = false; page.ngOnChanges(changed('viewActive')); }
    if (reason === 'background') appActive.next(false);
    if (reason === 'destroyed') page.ngOnDestroy();
    expect(signal.aborted).toBe(true);
    release();
    await Promise.resolve(); await Promise.resolve();
    expect(port.sendCommand).not.toHaveBeenCalled();
    expect(page.error).toBe('');
    if (reason !== 'destroyed') page.ngOnDestroy();
  });

  it('shows an unknown execution result and does not retry when the connection recovers', async () => {
    const { page, port } = harness();
    await vi.waitFor(() => expect(page.canControl).toBe(true));
    port.sendCommand.mockRejectedValueOnce({ code: 'DEVICE_V2_COMMAND_OUTCOME_UNKNOWN' });
    const field = page.endpoint(page.widgets[3])!;
    await page.execute(field);
    expect(page.fieldError(field)).toContain('勿重复操作');
    port.connectionState.next('ready');
    await Promise.resolve();
    expect(port.sendCommand).toHaveBeenCalledOnce();
    page.ngOnDestroy();
  });

  it('keeps cached values but disables controls after a ready timeout', async () => {
    const { page, port } = harness();
    await vi.waitFor(() => expect(page.canControl).toBe(true));
    page.viewActive = false; page.ngOnChanges(changed('viewActive'));
    port.connect.mockRejectedValueOnce({ code: 'DEVICE_V2_READY_TIMEOUT' });
    page.viewActive = true; page.ngOnChanges(changed('viewActive'));
    await vi.waitFor(() => expect(page.error).toContain('本次未发送控制指令'));
    expect(page.canControl).toBe(false);
    expect(page.value(page.endpoint(page.widgets[0])!)).toBe(false);
    await page.execute(page.endpoint(page.widgets[3])!);
    expect(port.sendCommand).not.toHaveBeenCalled();
    page.ngOnDestroy();
  });

  it('renders UI state and sends typed commands for the basic controls', async () => {
    const { page, port, state, events } = harness();
    await vi.waitFor(() => expect(page.canControl).toBe(true));

    expect(port.openConnection).toHaveBeenCalledWith(logicalDeviceId, expect.any(AbortSignal));
    await vi.waitFor(() => expect(page.widgets.map(widget => widget.type)).toEqual(['switch', 'slider', 'input', 'button']));
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
    page.ngOnChanges(changed('device'));
    await vi.waitFor(() => expect(page.error).toContain('connection lost'));

    port.connectionState.next('ready');
    await vi.waitFor(() => {
      expect(port.openConnection).toHaveBeenCalledTimes(3);
      expect(page.error).toBe('');
    });
  });

  it('detaches page subscriptions without stopping the shared account connection', () => {
    const { page, state, events } = harness();
    page.ngOnDestroy();
    expect(state.observed).toBe(false);
    expect(events.observed).toBe(false);
  });

  it('retries a stopped BLE session only within the visible foreground budget', async () => {
    vi.useFakeTimers();
    try {
      const { page, port, connectivity } = harness();
      await Promise.resolve();
      port.openConnection.mockClear();

      connectivity.next({
        ...connectivity.value,
        bleState: 'stopped',
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(port.openConnection).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2500);
      expect(port.openConnection).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(5000);
      expect(port.openConnection).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(port.openConnection).toHaveBeenCalledTimes(3);

      page.viewActive = false;
      page.ngOnChanges(changed('viewActive'));
      page.viewActive = true;
      page.ngOnChanges(changed('viewActive'));
      await vi.advanceTimersByTimeAsync(1000);
      expect(port.openConnection).toHaveBeenCalledTimes(5);
      page.ngOnDestroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('connects a nearby BLE device within the same bounded foreground budget', async () => {
    vi.useFakeTimers();
    try {
      const { page, port, connectivity } = harness();
      await Promise.resolve();
      port.openConnection.mockClear();

      connectivity.next({ ...connectivity.value, bleState: 'nearby' });
      await vi.advanceTimersByTimeAsync(1000);

      expect(port.openConnection).toHaveBeenCalledTimes(1);
      page.ngOnDestroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for gateway route release before retrying Direct BLE', async () => {
    vi.useFakeTimers();
    try {
      const { page, port, connectivity } = harness();
      await Promise.resolve();
      port.openConnection.mockClear();

      connectivity.next({
        ...connectivity.value,
        directConnectAllowed: false,
        bleState: 'nearby',
      });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(port.openConnection).not.toHaveBeenCalled();

      connectivity.next({
        ...connectivity.value,
        directConnectAllowed: true,
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(port.openConnection).toHaveBeenCalledOnce();
      page.ngOnDestroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts a fresh reconnect budget when Bluetooth is enabled again', async () => {
    vi.useFakeTimers();
    try {
      const { page, port, connectivity } = harness();
      await Promise.resolve();
      port.openConnection.mockClear();

      connectivity.next({
        ...connectivity.value,
        bleAdapterEnabled: false,
        bleState: 'stopped',
      });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(port.openConnection).not.toHaveBeenCalled();

      connectivity.next({ ...connectivity.value, bleAdapterEnabled: true });
      await vi.advanceTimersByTimeAsync(1000);
      expect(port.openConnection).toHaveBeenCalledOnce();
      page.ngOnDestroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a pending BLE reconnect when the page leaves or the session recovers', async () => {
    vi.useFakeTimers();
    try {
      const { page, port, connectivity } = harness();
      await Promise.resolve();
      port.openConnection.mockClear();
      connectivity.next({ ...connectivity.value, bleState: 'stopped' });
      page.viewActive = false;
      page.ngOnChanges(changed('viewActive'));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(port.openConnection).not.toHaveBeenCalled();

      page.viewActive = true;
      page.ngOnChanges(changed('viewActive'));
      connectivity.next({ ...connectivity.value, bleState: 'ready' });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(port.openConnection).toHaveBeenCalledTimes(1);
      page.ngOnDestroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses BLE reconnect while backgrounded and starts a fresh foreground budget', async () => {
    vi.useFakeTimers();
    try {
      const { page, port, appActive, connectivity } = harness();
      await Promise.resolve();
      port.openConnection.mockClear();
      connectivity.next({ ...connectivity.value, bleState: 'stopped' });
      appActive.next(false);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(port.openConnection).not.toHaveBeenCalled();

      appActive.next(true);
      await Promise.resolve();
      expect(port.openConnection).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(port.openConnection).toHaveBeenCalledTimes(2);
      page.ngOnDestroy();
    } finally {
      vi.useRealTimers();
    }
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

    page.viewActive = false;
    page.ngOnChanges(changed('viewActive'));
    await vi.waitFor(() => expect(telemetryLease.setVisible).toHaveBeenCalledWith(false));
    expect(page.value(field)).toBe(20);

    appActive.next(false);
    appActive.next(true);
    expect(telemetryLease.setVisible.mock.calls.some(call => call[0] === true)).toBe(false);

    page.viewActive = true;
    page.ngOnChanges(changed('viewActive'));
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
    result.page.viewActive = false;
    result.page.ngOnChanges(changed('viewActive'));
    resolveOpen(result.telemetryLease);
    await vi.waitFor(() => expect(result.telemetryLease.close).toHaveBeenCalledOnce());

    result.page.viewActive = true;
    result.page.ngOnChanges(changed('viewActive'));
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
