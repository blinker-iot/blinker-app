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
) {
  const state = new BehaviorSubject(initial);
  const events = new Subject<DeviceUiEvent>();
  const appActive = new BehaviorSubject(true);
  const telemetry = new BehaviorSubject<DeviceUiTelemetrySnapshot>({
    active: true,
    source: 'cloud',
    streamId: 1,
    epoch: 1,
    effectiveIntervalMs: 1000,
    missedSamples: 0,
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
      telemetry.next({ ...telemetry.value, active: visible, sampleSequence: undefined,
        sampleMonotonicMs: undefined, receivedAtMs: undefined, receivedMonotonicMs: undefined,
        missedSamples: 0, values: {} });
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
  const page = new DeviceV2Page(port as any, localPageLayouts);
  page.device = device();
  page.viewActive = viewActive;
  page.ngOnInit();
  return { page, port, state, events, appActive, connectivity, telemetry, telemetryLease };
}

describe('DeviceV2Page UI port lifecycle', () => {
  it('uses compatible shared labels while preserving explicit widget titles and protocol values', async () => {
    const { page } = harness();
    page.device.displayMetadata = { logicalDeviceId, revision: 1, name: '客厅灯', capabilities: [
      { key: 'power', kind: 0, type: 0, displayName: '电源开关', trueLabel: '亮', falseLabel: '灭' },
    ] };
    const field = endpoint({ manifestKind: 0, manifestType: 0, value: true });
    const widget = { widgetId: 'power', endpointKey: 'power', type: 'switch' as const,
      grid: { x: 0, y: 0, width: 8, height: 1 } };
    expect(page.fieldTitle(widget, field)).toBe('电源开关');
    expect(page.fieldTitle({ ...widget, title: 'power' }, field)).toBe('电源开关');
    expect(page.fieldTitle({ ...widget, title: '我的按钮' }, field)).toBe('我的按钮');
    expect(page.fieldTitle(widget, { ...field, manifestType: 2 })).toBe('power');
    expect(page.display(field)).toBe('亮');
    expect(page.value(field)).toBe(true);
    expect(field.key).toBe('power');
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
    expect(page.stateLabel).toBe(activeTransport === 'lan' ? '局域网已连接' : '云端已连接');
    await page.setBoolean(page.snapshot.endpoints[0]!, { detail: { checked: true } } as CustomEvent);
    expect(port.sendCommand).toHaveBeenCalledOnce();
    // Inventory becoming online cannot re-enable a stale live snapshot.
    page.device.data.cloudReachable = true;
    state.next({ ...snapshot(), stateFresh: false });
    expect(page.canControl).toBe(false);
    expect(page.stateLabel).toBe('设备状态未同步');
    await page.execute(page.snapshot.endpoints[3]!);
    expect(port.sendCommand).toHaveBeenCalledOnce();
    state.next(snapshot()); port.connectionState.next('retrying');
    expect(page.canControl).toBe(false);
    expect(page.stateLabel).toBe('正在重连');
    port.connectionState.next('stopped');
    expect(page.stateLabel).toBe('离线');
    page.ngOnDestroy();
  });
  it('updates selected carrier labels without another ready event or inventory evidence', async () => {
    const { page, port, connectivity, state } = harness();
    try {
      await vi.waitFor(() => expect(page.canControl).toBe(true));
      page.device.data.cloudReachable = false;
      expect(page.stateLabel).toBe('蓝牙已连接');
      const labels = { lan: '局域网已连接', cloud: '云端已连接', ble: '蓝牙已连接' };
      for (const activeTransport of ['lan', 'cloud', 'ble'] as const) {
        connectivity.next({ ...connectivity.value, activeTransport });
        expect(page.stateLabel).toBe(labels[activeTransport]);
        expect(page.canControl).toBe(true);
      }
      state.next({ ...snapshot(), stateFresh: false });
      expect(page.stateLabel).toBe('设备状态未同步');
      expect(page.canControl).toBe(false);
      state.next(snapshot());
      expect(page.stateLabel).toBe('蓝牙已连接');
      const connection = port.openConnection.mock.results.at(-1)!.value;
      connection.close();
      expect(page.stateLabel).toBe('连接未就绪');
      expect(page.canControl).toBe(false);
    } finally { page.ngOnDestroy(); }
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

    expect(port.connect).toHaveBeenCalledWith(logicalDeviceId, expect.any(AbortSignal));
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

  it.each(['', ' ', '\t\n', '\u00a0'])('rejects a blank numeric draft without a command (%j)', async input => {
    const { page, port } = harness();
    try {
      await vi.waitFor(() => expect(page.canControl).toBe(true));
      const field = page.snapshot.endpoints.find(candidate => candidate.key === 'level')!;
      page.updateDraft(field, { detail: { value: input } } as CustomEvent);
      await page.commit(field);
      expect(page.fieldError(field)).toBe('请输入有效数值');
      expect(port.sendCommand).not.toHaveBeenCalled();
      expect(page.pending.size).toBe(0);
    } finally { page.ngOnDestroy(); }
  });

  it('accepts explicit integer zero after a blank draft and keeps integer rejection', async () => {
    const { page, port } = harness();
    try {
      await vi.waitFor(() => expect(page.canControl).toBe(true));
      const field = page.snapshot.endpoints.find(candidate => candidate.key === 'level')!;
      for (const value of ['', '0', '42', '1.5']) {
        page.updateDraft(field, { detail: { value } } as CustomEvent);
        await page.commit(field);
      }
      expect(port.sendCommand.mock.calls).toEqual([
        [logicalDeviceId, 'level', 0], [logicalDeviceId, 'level', 42],
      ]);
      expect(page.fieldError(field)).toBe('请输入有效数值');
    } finally { page.ngOnDestroy(); }
  });

  it('uses only compatible current endpoint aliases for recent event names', () => {
    const initial = snapshot();
    initial.endpoints.push(endpoint({ id: 5, key: 'alarm', role: 'event', valueType: 'integer',
      writable: false, manifestKind: 2, manifestType: 2 }));
    const { page, state, events } = harness(initial);
    try {
      page.device.displayMetadata = { logicalDeviceId, revision: 1, name: '客厅灯', capabilities: [
        { key: 'alarm', kind: 2, type: 2, displayName: '报警次数' },
        { key: 'removed', kind: 2, type: 2, displayName: '已删除事件' },
      ] };
      events.next({ logicalDeviceId, values: { alarm: 0, removed: 1 } });
      expect(page.lastEventText).toBe('报警次数: 0, removed: 1');
      state.next({ ...initial, endpoints: initial.endpoints.map(field => field.key === 'alarm'
        ? { ...field, manifestType: 1 } : field) });
      expect(page.lastEventText).toBe('alarm: 0, removed: 1');
      expect(page.lastEvent?.values).toEqual({ alarm: 0, removed: 1 });
    } finally { page.ngOnDestroy(); }
  });

  it('surfaces synchronization failure and retries when the account reconnects', async () => {
    const { page, port } = harness();
    port.connect.mockRejectedValueOnce(new Error('connection lost'));
    page.device = { ...device(), deviceName: logicalDeviceId.replace(/1/g, '2') };
    page.ngOnChanges(changed('device'));
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

  it('retries a stopped BLE session only within the visible foreground budget', async () => {
    vi.useFakeTimers();
    try {
      const { page, port, connectivity } = harness();
      await Promise.resolve();
      port.connect.mockClear();

      connectivity.next({
        ...connectivity.value,
        bleState: 'stopped',
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(port.connect).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2500);
      expect(port.connect).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(5000);
      expect(port.connect).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(port.connect).toHaveBeenCalledTimes(3);

      page.viewActive = false;
      page.ngOnChanges(changed('viewActive'));
      page.viewActive = true;
      page.ngOnChanges(changed('viewActive'));
      await vi.advanceTimersByTimeAsync(1000);
      expect(port.connect).toHaveBeenCalledTimes(5);
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
      port.connect.mockClear();

      connectivity.next({ ...connectivity.value, bleState: 'nearby' });
      await vi.advanceTimersByTimeAsync(1000);

      expect(port.connect).toHaveBeenCalledTimes(1);
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
      port.connect.mockClear();

      connectivity.next({
        ...connectivity.value,
        directConnectAllowed: false,
        bleState: 'nearby',
      });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(port.connect).not.toHaveBeenCalled();

      connectivity.next({
        ...connectivity.value,
        directConnectAllowed: true,
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(port.connect).toHaveBeenCalledOnce();
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
      port.connect.mockClear();

      connectivity.next({
        ...connectivity.value,
        bleAdapterEnabled: false,
        bleState: 'stopped',
      });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(port.connect).not.toHaveBeenCalled();

      connectivity.next({ ...connectivity.value, bleAdapterEnabled: true });
      await vi.advanceTimersByTimeAsync(1000);
      expect(port.connect).toHaveBeenCalledOnce();
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
      port.connect.mockClear();
      connectivity.next({ ...connectivity.value, bleState: 'stopped' });
      page.viewActive = false;
      page.ngOnChanges(changed('viewActive'));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(port.connect).not.toHaveBeenCalled();

      page.viewActive = true;
      page.ngOnChanges(changed('viewActive'));
      connectivity.next({ ...connectivity.value, bleState: 'ready' });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(port.connect).toHaveBeenCalledTimes(1);
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
      port.connect.mockClear();
      connectivity.next({ ...connectivity.value, bleState: 'stopped' });
      appActive.next(false);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(port.connect).not.toHaveBeenCalled();

      appActive.next(true);
      await Promise.resolve();
      expect(port.connect).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(port.connect).toHaveBeenCalledTimes(2);
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
      source: 'cloud',
      streamId: 1,
      epoch: 1,
      effectiveIntervalMs: 1000,
      sampleSequence: 1,
      sampleMonotonicMs: 100,
      receivedAtMs: Date.now(),
      receivedMonotonicMs: performance.now(),
      missedSamples: 0,
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

  it('replaces realtime and clears its curve when the carrier changes ready to ready', async () => {
    const realtime = snapshot();
    realtime.endpoints.push(endpoint({ id: 5, key: 'temperature', valueType: 'number', value: 20,
      writable: false, telemetryMinimumIntervalMs: 1000 }));
    const { page, port, connectivity, telemetry, telemetryLease } = harness(realtime);
    try {
      await vi.waitFor(() => expect(telemetryLease.subscribe).toHaveBeenCalledOnce());
      const field = page.snapshot.endpoints.find(candidate => candidate.key === 'temperature')!;
      telemetry.next({ ...telemetry.value, source: 'ble', sampleSequence: 1,
        receivedMonotonicMs: performance.now(), values: { temperature: 22 } });
      expect(page.value(field)).toBe(22); expect(page.telemetryField(field)?.points).toHaveLength(1);
      // Only connectivity changes; watchConnection remains ready throughout.
      connectivity.next({ ...connectivity.value, activeTransport: 'cloud', bleState: 'stopped' });
      expect(telemetryLease.close).toHaveBeenCalledOnce(); expect(page.value(field)).toBe(20);
      expect(page.telemetryField(field)).toBeUndefined();
      telemetry.next({ ...telemetry.value, source: 'cloud', epoch: 2, sampleSequence: undefined, values: {} });
      await vi.waitFor(() => expect(port.openTelemetry).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(telemetryLease.subscribe).toHaveBeenCalledTimes(2));
      expect(page.telemetryField(field)?.status).toBe('waiting');
      expect(page.telemetryField(field)?.points).toHaveLength(0);
      expect(page.telemetrySummary).toContain('云端 MQTT');
      connectivity.next({ ...connectivity.value });
      expect(port.openTelemetry).toHaveBeenCalledTimes(2);
      // A verified LAN promotion owns a different realtime carrier too.
      connectivity.next({ ...connectivity.value, activeTransport: 'lan' });
      expect(telemetryLease.close).toHaveBeenCalledTimes(2);
      expect(page.telemetryField(field)).toBeUndefined();
      telemetry.next({ ...telemetry.value, source: 'lan', epoch: 3, sampleSequence: undefined, values: {} });
      await vi.waitFor(() => expect(port.openTelemetry).toHaveBeenCalledTimes(3));
      await vi.waitFor(() => expect(telemetryLease.subscribe).toHaveBeenCalledTimes(3));
      expect(page.telemetrySummary).toContain('局域网');
      expect(page.telemetryField(field)?.points).toHaveLength(0);
      connectivity.next({ ...connectivity.value });
      expect(port.openTelemetry).toHaveBeenCalledTimes(3);
    } finally { page.ngOnDestroy(); }
  });

  it('closes a late old-carrier Open without admitting its values to the new carrier', async () => {
    const realtime = snapshot();
    realtime.endpoints.push(endpoint({ id: 5, key: 'temperature', valueType: 'number', value: 20,
      writable: false, telemetryMinimumIntervalMs: 1000 }));
    let finish!: (lease: DeviceUiTelemetryLease) => void;
    const pending = new Promise<DeviceUiTelemetryLease>(resolve => { finish = resolve; });
    const old = { snapshot: {} as DeviceUiTelemetrySnapshot, subscribe: vi.fn(),
      setVisible: vi.fn(), close: vi.fn(async () => undefined) };
    const { page, port, connectivity, telemetryLease } = harness(realtime, undefined, () => pending);
    try {
      await vi.waitFor(() => expect(port.openTelemetry).toHaveBeenCalledOnce());
      port.openTelemetry.mockResolvedValueOnce(telemetryLease);
      connectivity.next({ ...connectivity.value, activeTransport: 'cloud', bleState: 'stopped' });
      await vi.waitFor(() => expect(telemetryLease.subscribe).toHaveBeenCalledOnce());
      finish(old); await vi.waitFor(() => expect(old.close).toHaveBeenCalledOnce());
      expect(old.subscribe).not.toHaveBeenCalled();
      expect(page.telemetrySummary).toContain('云端 MQTT');
    } finally { finish(old); page.ngOnDestroy(); }
  });

  it('shows an explicit unsupported Direct realtime error without disabling ordinary controls', async () => {
    const realtime = snapshot();
    realtime.endpoints.push(endpoint({ id: 5, key: 'temperature', valueType: 'number', value: 20,
      writable: false, telemetryMinimumIntervalMs: 1000 }));
    const { page, port } = harness(realtime, undefined, async () => {
      throw Error('DIRECT_TELEMETRY_NOT_SUPPORTED');
    });
    try {
      await vi.waitFor(() => expect(page.telemetryError).toBe('此设备固件暂不支持本地实时数据'));
      expect(page.accountState).toBe('ready'); expect(page.error).toBe('');
      expect(port.disconnect).not.toHaveBeenCalled();
    } finally { page.ngOnDestroy(); }
  });

  it('shows the confirmed cloud interval and ages samples without a new message', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let now = 100;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const realtime = snapshot();
    realtime.endpoints.push(endpoint({ id: 5, key: 'temperature', valueType: 'number', value: 20,
      writable: false, telemetryMinimumIntervalMs: 1000 }));
    const { page, telemetry, telemetryLease } = harness(realtime);
    try {
      await vi.waitFor(() => expect(telemetryLease.subscribe).toHaveBeenCalledOnce());
      const field = page.snapshot.endpoints.find(candidate => candidate.key === 'temperature')!;
      expect(page.telemetryField(field)?.status).toBe('waiting');
      expect(page.value(field)).toBe(20);
      telemetry.next({ ...telemetry.value, effectiveIntervalMs: 2000, sampleSequence: 1,
        receivedMonotonicMs: now, receivedAtMs: Date.now(), sampleMonotonicMs: 99,
        values: { temperature: 22 } });
      expect(page.telemetrySummary).toBe('云端 MQTT · 实际 2 秒/次');
      expect(page.telemetryField(field)?.points).toHaveLength(1);
      now += 6000;
      await vi.advanceTimersByTimeAsync(1000);
      expect(page.telemetryField(field)?.status).toBe('stale');
      expect(page.telemetryFreshness(page.telemetryField(field)!)).toContain('数据陈旧');
      // A status/renew update can change the interval, but is not a new sample.
      telemetry.next({ ...telemetry.value, effectiveIntervalMs: 1000 });
      expect(page.telemetryField(field)?.ageMs).toBe(6000);
      expect(page.telemetryField(field)?.points).toHaveLength(1);
    } finally {
      page.ngOnDestroy();
      clock.mockRestore();
      vi.useRealTimers();
    }
  });

  it('clears realtime values and its clock immediately on background and ignores late samples', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const realtime = snapshot();
    realtime.endpoints.push(endpoint({ id: 5, key: 'temperature', valueType: 'number', value: 20,
      writable: false, telemetryMinimumIntervalMs: 1000 }));
    const { page, telemetry, telemetryLease, appActive } = harness(realtime);
    try {
      await vi.waitFor(() => expect(telemetryLease.subscribe).toHaveBeenCalledOnce());
      const field = page.snapshot.endpoints.find(candidate => candidate.key === 'temperature')!;
      telemetry.next({ ...telemetry.value, sampleSequence: 1, receivedMonotonicMs: performance.now(),
        values: { temperature: 22 } });
      expect(page.value(field)).toBe(22);
      expect(vi.getTimerCount()).toBe(1);
      appActive.next(false);
      expect(page.value(field)).toBe(20);
      expect(page.telemetryActive).toBe(false);
      expect(page.telemetryField(field)).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
      telemetry.next({ ...telemetry.value, active: true, sampleSequence: 2,
        receivedMonotonicMs: performance.now(), values: { temperature: 99 } });
      expect(page.value(field)).toBe(20);
      expect(vi.getTimerCount()).toBe(0);
      appActive.next(true);
      await vi.waitFor(() => expect(telemetryLease.setVisible).toHaveBeenLastCalledWith(true));
      expect(page.telemetryField(field)?.status).toBe('waiting');
      expect(page.telemetryField(field)?.points).toHaveLength(0);
    } finally {
      page.ngOnDestroy();
      vi.useRealTimers();
    }
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
