import type { PlatformCapabilities } from 'capacitor-wifiprov';

/** Feature negotiation only; neither this flag nor SSID is a connection receipt. */
export function supportsSystemConnectedReadOnly(capabilities?: PlatformCapabilities): boolean {
  return capabilities?.platform === 'android' && capabilities.softApProvisioning === true
    && capabilities.softApSystemConnectedReadOnly === true;
}

export function assertSystemConnectedReadOnly(capabilities?: PlatformCapabilities): void {
  if (!supportsSystemConnectedReadOnly(capabilities)) {
    throw Object.assign(new Error('当前原生插件不支持手动只读连接，请使用匹配的 Android App'),
      { code: 'WIFIPROV_SYSTEM_CONNECTED_UNSUPPORTED' });
  }
}

export function assertProvisioningWritable(readOnly: boolean): void {
  if (readOnly) throw Object.assign(new Error('手动连接仅支持查看 Wi-Fi 扫描结果，不会写入身份或网络配置'),
    { code: 'WIFIPROV_READ_ONLY' });
}

export function systemConnectedErrorMessage(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  switch (code) {
    case 'WIFIPROV_PERMISSION_REQUIRED': return '请允许精确位置与附近设备权限，并打开系统定位后手动重新开始';
    case 'WIFIPROV_SYSTEM_WIFI_UNVERIFIED': return '无法核对当前热点，请先在系统 WLAN 连接指定热点，再手动重新开始';
    case 'WIFIPROV_RESPONSE_UNCONFIRMED': return '热点或网络绑定无法确认，会话已隔离，请手动重新开始';
    case 'WIFIPROV_CONNECTION_MODE_LOCKED': return '本次连接方式已固定，请手动重新开始后选择';
    case 'WIFIPROV_SYSTEM_CONNECTED_READ_ONLY': return '手动连接仅支持查看扫描结果，不能写入设备';
    default: return undefined; // In particular, never replace UNKNOWN or its receipt.
  }
}
