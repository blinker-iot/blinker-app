export const NTFY_CONFIG = {
  /**
   * ntfy.sh is the official public service. Anonymous topics are public, so
   * the app creates a random per-install topic instead of committing one.
   * Replace this configuration with a protected self-hosted topic for release.
   */
  enabled: true,
  baseUrl: 'https://ntfy.sh',
  topicPrefix: 'blinker-test',
  topicStorageKey: 'blinker.ntfy.test-topic',
  initialSince: '10m',
  autoStartOnBoot: false,
  showNotifications: true,
  historyLimit: 20,
} as const;
