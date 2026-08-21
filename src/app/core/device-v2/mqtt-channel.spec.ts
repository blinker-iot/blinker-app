import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { IClientOptions, MqttClient } from 'mqtt';

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
  it('uses one strict MQTT 3.1.1 WebSocket connection and exact account topics', async () => {
    const mqttClient = new FakeMqttClient();
    const connect = vi.fn((url: string, options: IClientOptions) => {
      queueMicrotask(() => mqttClient.emit('connect'));
      return mqttClient as unknown as MqttClient;
    });
    const channel = await openMqttDeviceV2Channel(connection, connect);

    expect(connect).toHaveBeenCalledWith('wss://mqtt.example.test/mqtt', expect.objectContaining({
      clientId: connection.clientId,
      username: connection.username,
      password: connection.password,
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
