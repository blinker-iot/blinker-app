import mqtt, { IClientOptions, MqttClient } from 'mqtt';
import type { Buffer } from 'buffer';
import { Capacitor } from '@capacitor/core';

import { MqttConnection } from '../model/response.model';
import { DeviceV2Channel } from '../protocol/device-v2';
import { DeviceV2TransportConfigError } from './transport-config.error';

export type DeviceV2MqttConnect = (url: string, options: IClientOptions) => MqttClient;

const CONNECT_TIMEOUT_MS = 10_000;

function validTopic(value: string): boolean {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 512
    && !value.includes('\0')
    && !value.includes('+')
    && !value.includes('#');
}

function isLocalhost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '127.0.0.1'
    || normalized === '[::1]';
}

function requiresSecureWebSocket(): boolean {
  const native = Capacitor.isNativePlatform();
  if (typeof location === 'undefined') return native;
  if (location.protocol === 'http:') return false;
  if (!native && isLocalhost(location.hostname)) return false;
  return true;
}

function waitForConnect(client: MqttClient, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      client.off('connect', onConnect);
      client.off('error', onError);
      client.off('close', onClose);
    };
    const onConnect = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error('MQTT connection closed before CONNACK'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('MQTT connection timed out'));
    }, timeoutMs);
    client.once('connect', onConnect);
    client.once('error', onError);
    client.once('close', onClose);
  });
}

function subscribe(client: MqttClient, topic: string): Promise<void> {
  return new Promise((resolve, reject) => client.subscribe(topic, { qos: 0 }, error => {
    if (error) reject(error);
    else resolve();
  }));
}

function end(client: MqttClient): Promise<void> {
  return new Promise((resolve, reject) => client.end(false, {}, error => {
    if (error) reject(error);
    else resolve();
  }));
}

export class MqttDeviceV2Channel implements DeviceV2Channel {
  private readonly messages = new Set<(payload: Uint8Array) => void>();
  private readonly closes = new Set<(reason?: unknown) => void>();
  private closed = false;
  private closePromise?: Promise<void>;

  constructor(
    private readonly client: MqttClient,
    private readonly publishTopic: string,
    private readonly receiveTopic: string,
  ) {
    this.client.on('message', this.handleMessage);
    this.client.on('error', this.handleError);
    this.client.once('close', this.handleClose);
  }

  publish(payload: Uint8Array): Promise<void> {
    if (this.closed) return Promise.reject(new Error('MQTT channel is closed'));
    return new Promise((resolve, reject) => this.client.publish(
      this.publishTopic,
      payload as unknown as Buffer,
      { qos: 0, retain: false },
      error => error ? reject(error) : resolve(),
    ));
  }

  onMessage(listener: (payload: Uint8Array) => void): () => void {
    this.messages.add(listener);
    return () => this.messages.delete(listener);
  }

  onClose(listener: (reason?: unknown) => void): () => void {
    this.closes.add(listener);
    return () => this.closes.delete(listener);
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      this.detach();
    }
    if (!this.closePromise) this.closePromise = end(this.client);
    await this.closePromise;
  }

  private readonly handleMessage = (topic: string, payload: Uint8Array): void => {
    if (topic !== this.receiveTopic || this.closed) return;
    const copy = new Uint8Array(payload);
    for (const listener of this.messages) listener(copy);
  };

  private readonly handleError = (error: Error): void => this.fail(error);

  private readonly handleClose = (): void => this.fail(new Error('MQTT channel closed'));

  private fail(reason: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.detach();
    for (const listener of this.closes) listener(reason);
  }

  private detach(): void {
    this.client.off('message', this.handleMessage);
    this.client.off('error', this.handleError);
    this.client.off('close', this.handleClose);
  }
}

export async function openMqttDeviceV2Channel(
  connection: MqttConnection,
  connect: DeviceV2MqttConnect = mqtt.connect.bind(mqtt),
): Promise<MqttDeviceV2Channel> {
  if (!connection || (connection.protocol !== 'ws' && connection.protocol !== 'wss')
    || typeof connection.url !== 'string' || !connection.url.trim()
    || connection.url.trim() !== connection.url || connection.clean !== true
    || !connection.clientId || !connection.username || !connection.password
    || !validTopic(connection.publishTopic) || !validTopic(connection.subscribeTopic)
    || !Number.isInteger(connection.keepalive) || connection.keepalive < 1) {
    throw new DeviceV2TransportConfigError(
      'Device V2 MQTT WebSocket credential is invalid',
    );
  }
  let url: URL;
  try {
    url = new URL(connection.url);
  } catch {
    throw new DeviceV2TransportConfigError(
      'Device V2 MQTT WebSocket URL is invalid',
    );
  }
  if (url.protocol !== `${connection.protocol}:`
    || !url.hostname
    || url.username || url.password || url.search || url.hash
    || (connection.path !== undefined && connection.path !== url.pathname)) {
    throw new DeviceV2TransportConfigError(
      'Device V2 MQTT WebSocket URL is invalid',
    );
  }
  if (url.protocol === 'ws:' && requiresSecureWebSocket()) {
    throw new DeviceV2TransportConfigError(
      'Device V2 MQTT WebSocket URL must use wss in this context',
    );
  }
  const client = connect(connection.url, {
    clientId: connection.clientId,
    username: connection.username,
    password: connection.password,
    keepalive: connection.keepalive,
    clean: true,
    protocolVersion: 4,
    reconnectPeriod: 0,
    resubscribe: false,
  });
  try {
    await waitForConnect(client, CONNECT_TIMEOUT_MS);
    await subscribe(client, connection.subscribeTopic);
    return new MqttDeviceV2Channel(
      client,
      connection.publishTopic,
      connection.subscribeTopic,
    );
  } catch (error) {
    await end(client);
    throw error;
  }
}
