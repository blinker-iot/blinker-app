import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IClientOptions, MqttClient } from 'mqtt';
import { Capacitor } from '@capacitor/core';

import { MqttConnection } from '../model/response.model';
import { openMqttDeviceV2Channel } from './mqtt-channel';

class FakeMqttClient extends EventEmitter {
  readonly subscribe = vi.fn((topic: string, options: unknown, callback: (error?: Error) => void) => {
    callback();
    return this;
  });
  readonly publish = vi.fn((
    topic: string,
    payload: Uint8Array,
    options: unknown,
    callback: (error?: Error) => void,
  ) => {
    callback();
    return this;
  });
  readonly end = vi.fn((force: boolean, options: unknown, callback: () => void) => {
    callback();
    return this;
  });
}

const connection: MqttConnection = {
  host: 'mqtt.example.test',
  port: 443,
  protocol: 'wss',
  url: 'wss://mqtt.example.test/mqtt',
  path: '/mqtt',
  clientId: 'appu-user-a1b2c3d4',
  username: 'appu_user',
  password: 'short-lived-jwt',
  expiresIn: 600,
  publishTopic: '/device/appu-user-a1b2c3d4/s',
  subscribeTopic: '/device/appu-user-a1b2c3d4/r',
  keepalive: 60,
  clean: true,
};

describe('MqttDeviceV2Channel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('passes the exact wss URL to one MQTT 3.1.1 connection and keeps account topics', async () => {
    vi.stubGlobal('location', new URL('https://app.example.test/devices'));
    const mqttClient = new FakeMqttClient();
    const connect = vi.fn((url: string, options: IClientOptions) => {
      queueMicrotask(() => mqttClient.emit('connect'));
      return mqttClient as unknown as MqttClient;
    });
    const exactUrl = 'wss://MQTT.example.test:443/mqtt';
    const channel = await openMqttDeviceV2Channel({
      ...connection,
      url: exactUrl,
    }, connect);

    expect(connect).toHaveBeenCalledWith(exactUrl, expect.objectContaining({
      clientId: connection.clientId,
      username: connection.username,
      password: connection.password,
      keepalive: connection.keepalive,
      clean: true,
      protocolVersion: 4,
      reconnectPeriod: 0,
      resubscribe: false,
    }));
    expect(mqttClient.subscribe).toHaveBeenCalledWith(
      connection.subscribeTopic,
      { qos: 0 },
      expect.any(Function),
    );

    const received = vi.fn();
    channel.onMessage(received);
    mqttClient.emit('message', '/other/topic', Uint8Array.of(1));
    mqttClient.emit('message', connection.subscribeTopic, Uint8Array.of(2, 3));
    expect(received).toHaveBeenCalledOnce();
    expect(received).toHaveBeenCalledWith(Uint8Array.of(2, 3));

    await channel.publish(Uint8Array.of(4, 5));
    expect(mqttClient.publish).toHaveBeenCalledWith(
      connection.publishTopic,
      Uint8Array.of(4, 5),
      { qos: 0, retain: false },
      expect.any(Function),
    );
    await channel.close();
    expect(mqttClient.end).toHaveBeenCalledOnce();
  });

  it('rejects ws on an HTTPS page before MQTT.js is called', async () => {
    vi.stubGlobal('location', new URL('https://app.example.test/devices'));
    const connect = vi.fn();

    await expect(openMqttDeviceV2Channel({
      ...connection,
      protocol: 'ws',
      url: 'ws://mqtt.example.test/mqtt',
    }, connect)).rejects.toThrow(/must use wss/);
    expect(connect).not.toHaveBeenCalled();
  });

  it('allows ws for a localhost web development page', async () => {
    vi.stubGlobal('location', new URL('https://localhost:8100/devices'));
    const mqttClient = new FakeMqttClient();
    const connect = vi.fn((url: string) => {
      queueMicrotask(() => mqttClient.emit('connect'));
      return mqttClient as unknown as MqttClient;
    });
    const url = 'ws://localhost:1884/mqtt';

    const channel = await openMqttDeviceV2Channel({
      ...connection,
      protocol: 'ws',
      url,
    }, connect);

    expect(connect).toHaveBeenCalledWith(url, expect.any(Object));
    await channel.close();
  });

  it('rejects ws in a native WebView even when its origin is localhost', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.stubGlobal('location', new URL('https://localhost/devices'));
    const connect = vi.fn();

    await expect(openMqttDeviceV2Channel({
      ...connection,
      protocol: 'ws',
      url: 'ws://mqtt.example.test/mqtt',
    }, connect)).rejects.toThrow(/must use wss/);
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects TCP credentials instead of silently constructing an unusable browser URL', async () => {
    await expect(openMqttDeviceV2Channel({
      ...connection,
      protocol: 'mqtt',
      url: undefined,
    }, vi.fn())).rejects.toThrow(/WebSocket credential/);
  });

  it('rejects a URL that disagrees with the signed endpoint path', async () => {
    await expect(openMqttDeviceV2Channel({
      ...connection,
      url: 'wss://mqtt.example.test/other',
    }, vi.fn())).rejects.toThrow(/WebSocket URL/);
  });

  it.each([undefined, 'not a URL'] as const)(
    'rejects a missing or malformed URL before MQTT.js is called: %s',
    async url => {
      const connect = vi.fn();
      await expect(openMqttDeviceV2Channel({
        ...connection,
        url,
      }, connect)).rejects.toThrow(/WebSocket/);
      expect(connect).not.toHaveBeenCalled();
    },
  );

  it('reports a post-CONNACK error once and still releases the MQTT client', async () => {
    const mqttClient = new FakeMqttClient();
    const channel = await openMqttDeviceV2Channel(connection, () => {
      queueMicrotask(() => mqttClient.emit('connect'));
      return mqttClient as unknown as MqttClient;
    });
    const closed = vi.fn();
    channel.onClose(closed);

    const error = new Error('network failed');
    mqttClient.emit('error', error);
    mqttClient.emit('close');
    expect(closed).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledWith(error);

    await Promise.all([channel.close(), channel.close()]);
    expect(mqttClient.end).toHaveBeenCalledOnce();
  });
});
