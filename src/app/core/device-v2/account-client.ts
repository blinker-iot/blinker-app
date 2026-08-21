import { AccountConnectionResponse } from '../model/response.model';
import {
  DeviceV2Ack,
  DeviceV2Channel,
  DeviceV2Session,
  DeviceV2Store,
  DeviceV2TargetSnapshot,
} from '../protocol/device-v2';
import { DeviceV2TransportConfigError } from './transport-config.error';

export type DeviceV2AccountState = 'idle' | 'connecting' | 'ready' | 'retrying' | 'stopped';
export type DeviceV2CredentialProvider = () => Promise<AccountConnectionResponse>;
export type DeviceV2ChannelFactory = (
  response: AccountConnectionResponse,
) => Promise<DeviceV2Channel>;

export interface DeviceV2AccountClientOptions {
  reconnectBaseMs?: number;
  reconnectMaximumMs?: number;
}

export class DeviceV2AccountClient {
  readonly store = new DeviceV2Store();

  private stateValue: DeviceV2AccountState = 'idle';
  private desired = false;
  private generation = 0;
  private reconnectAttempt = 0;
  private connecting?: Promise<void>;
  private session?: DeviceV2Session;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private transportConfigError?: DeviceV2TransportConfigError;
  private readonly listeners = new Set<(state: DeviceV2AccountState) => void>();
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaximumMs: number;

  constructor(
    private readonly credentials: DeviceV2CredentialProvider,
    private readonly channels: DeviceV2ChannelFactory,
    options: DeviceV2AccountClientOptions = {},
  ) {
    this.reconnectBaseMs = options.reconnectBaseMs ?? 1000;
    this.reconnectMaximumMs = options.reconnectMaximumMs ?? 30_000;
    if (!Number.isInteger(this.reconnectBaseMs) || this.reconnectBaseMs < 1
      || !Number.isInteger(this.reconnectMaximumMs)
      || this.reconnectMaximumMs < this.reconnectBaseMs) {
      throw new Error('Device V2 account reconnect options are invalid');
    }
  }

  get state(): DeviceV2AccountState {
    return this.stateValue;
  }

  subscribeState(listener: (state: DeviceV2AccountState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): Promise<void> {
    if (this.transportConfigError) return Promise.reject(this.transportConfigError);
    this.desired = true;
    if (this.session?.state === 'ready') return Promise.resolve();
    return this.connect();
  }

  async stop(): Promise<void> {
    if (!this.desired && this.stateValue === 'stopped') return;
    this.desired = false;
    this.generation += 1;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const connecting = this.connecting;
    if (connecting) await connecting.catch(() => undefined);
    try {
      await this.closeSession();
    } finally {
      this.setState('stopped');
    }
  }

  async reset(): Promise<void> {
    try {
      await this.stop();
    } finally {
      this.transportConfigError = undefined;
      this.reconnectAttempt = 0;
      this.store.clear();
    }
  }

  async ensureReady(logicalDeviceId: string): Promise<void> {
    await this.start();
    await this.requireSession().ensureReady(logicalDeviceId);
  }

  async command(logicalDeviceId: string, endpointKey: string, value: unknown): Promise<DeviceV2Ack> {
    await this.start();
    return this.requireSession().command(logicalDeviceId, endpointKey, value);
  }

  snapshot(logicalDeviceId: string): DeviceV2TargetSnapshot {
    return this.store.snapshot(logicalDeviceId);
  }

  private connect(force = false): Promise<void> {
    if (this.transportConfigError) return Promise.reject(this.transportConfigError);
    if (!this.desired) return Promise.reject(new Error('Device V2 account client is stopped'));
    if (!force && this.session?.state === 'ready') return Promise.resolve();
    if (this.connecting) return this.connecting;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const generation = ++this.generation;
    const task = this.open(generation).catch(async error => {
      if (this.desired && generation === this.generation) {
        if (error instanceof DeviceV2TransportConfigError) {
          await this.blockTransport(error);
        } else {
          this.scheduleReconnect();
        }
      }
      throw error;
    }).finally(() => {
      if (this.connecting === task) this.connecting = undefined;
    });
    this.connecting = task;
    return task;
  }

  private async open(generation: number): Promise<void> {
    this.setState('connecting');
    const response = await this.credentials();
    if (!this.desired || generation !== this.generation) return;
    this.validateCredential(response);
    await this.closeSession();
    const channel = await this.channels(response);
    if (!this.desired || generation !== this.generation) {
      await channel.close?.();
      return;
    }
    const session = new DeviceV2Session(channel, this.store);
    session.subscribeErrors(() => {
      if (this.desired && this.session === session) this.scheduleReconnect();
    });
    this.session = session;
    try {
      await session.start();
    } catch (error) {
      if (this.session === session) this.session = undefined;
      await session.close().catch(() => undefined);
      throw error;
    }
    if (!this.desired || generation !== this.generation || this.session !== session) {
      await session.close();
      return;
    }
    this.reconnectAttempt = 0;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.setState('ready');
    const refreshSeconds = Math.max(1, Math.floor(response.mqtt.expiresIn * 0.8));
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.connect(true).catch(() => undefined);
    }, refreshSeconds * 1000);
  }

  private scheduleReconnect(): void {
    if (!this.desired || this.reconnectTimer) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    this.setState('retrying');
    const delay = Math.min(
      this.reconnectMaximumMs,
      this.reconnectBaseMs * (2 ** Math.min(this.reconnectAttempt, 10)),
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect(true).catch(() => undefined);
    }, delay);
  }

  private async closeSession(): Promise<void> {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    const session = this.session;
    this.session = undefined;
    if (session) await session.close();
  }

  private validateCredential(response: AccountConnectionResponse): void {
    if (!response || response.wire !== 'bbp2' || response.protocolVersion !== 2
      || response.transport !== 'websocket'
      || !response.mqtt
      || !Number.isInteger(response.mqtt.expiresIn) || response.mqtt.expiresIn < 1) {
      throw new DeviceV2TransportConfigError(
        'Device V2 account credential contract is invalid',
      );
    }
  }

  private async blockTransport(error: DeviceV2TransportConfigError): Promise<void> {
    this.desired = false;
    this.generation += 1;
    this.transportConfigError = error;
    this.reconnectAttempt = 0;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    await this.closeSession().catch(() => undefined);
    this.setState('stopped');
  }

  private requireSession(): DeviceV2Session {
    if (this.session?.state !== 'ready') throw new Error('Device V2 account session is not ready');
    return this.session;
  }

  private setState(state: DeviceV2AccountState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    for (const listener of this.listeners) listener(state);
  }
}
