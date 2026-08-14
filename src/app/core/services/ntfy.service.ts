import { Injectable } from '@angular/core';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Ntfy, type NtfyMessage, type NtfyStatus } from 'capacitor-ntfy';

import { NTFY_CONFIG } from '../../configs/ntfy.config';

@Injectable({
  providedIn: 'root',
})
export class NtfyService {
  private initialized = false;
  private listeners: PluginListenerHandle[] = [];

  async init(): Promise<void> {
    if (
      this.initialized ||
      !NTFY_CONFIG.enabled ||
      Capacitor.getPlatform() !== 'android'
    ) {
      return;
    }

    this.initialized = true;
    try {
      this.listeners.push(
        await Ntfy.addListener('statusChanged', (status) =>
          this.logStatus('changed', status)
        ),
        await Ntfy.addListener('messageReceived', (message) =>
          this.logMessage(message)
        )
      );

      const permission = await Ntfy.requestNotificationPermission();
      const topic = this.getOrCreateTestTopic();
      console.info(`[ntfy] official test topic: ${topic}`);
      console.info(`[ntfy] notification permission: ${permission.state}`);

      const status = await Ntfy.start({
        baseUrl: NTFY_CONFIG.baseUrl,
        topics: [topic],
        initialSince: NTFY_CONFIG.initialSince,
        autoStartOnBoot: NTFY_CONFIG.autoStartOnBoot,
        showNotifications: NTFY_CONFIG.showNotifications,
        historyLimit: NTFY_CONFIG.historyLimit,
        foregroundTitle: 'blinker ntfy 测试连接',
        foregroundText: `正在监听 ${topic}`,
        serviceChannelId: 'blinker_ntfy_test_service',
        serviceChannelName: 'blinker ntfy 测试连接',
        messageChannelId: 'blinker_ntfy_test_messages',
        messageChannelName: 'blinker ntfy 测试消息',
      });
      this.logStatus('started', status);

      const { messages } = await Ntfy.getMessages({ limit: 5 });
      console.info(`[ntfy] recent message count: ${messages.length}`);
    } catch (error) {
      this.initialized = false;
      await this.removeListeners();
      console.error('[ntfy] initialization failed', error);
    }
  }

  private getOrCreateTestTopic(): string {
    const stored = localStorage.getItem(NTFY_CONFIG.topicStorageKey)?.trim();
    if (stored) return stored;

    const random = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID().replaceAll('-', '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const topic = `${NTFY_CONFIG.topicPrefix}-${random}`;
    localStorage.setItem(NTFY_CONFIG.topicStorageKey, topic);
    return topic;
  }

  private logStatus(label: string, status: NtfyStatus): void {
    console.info(`[ntfy] status ${label}: ${JSON.stringify(status)}`);
  }

  private logMessage(message: NtfyMessage): void {
    console.info(`[ntfy] message received: ${JSON.stringify(message)}`);
  }

  private async removeListeners(): Promise<void> {
    const listeners = this.listeners.splice(0);
    await Promise.all(listeners.map((listener) => listener.remove()));
  }
}
