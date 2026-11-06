export type WiFiProvWiFiFailureReason = 'AUTH_FAILED' | 'NETWORK_NOT_FOUND';

/** Only exact native SDK device reasons, never a transport/session failure. */
export function wiFiProvWiFiFailureReasonFromCode(code: unknown): WiFiProvWiFiFailureReason | undefined {
  if (code === 'WIFIPROV_WIFI_AUTH_FAILED') return 'AUTH_FAILED';
  if (code === 'WIFIPROV_WIFI_NETWORK_NOT_FOUND') return 'NETWORK_NOT_FOUND';
  return undefined;
}

export function explicitWiFiRejectionReason(error: unknown): WiFiProvWiFiFailureReason | undefined {
  const value = error as { code?: unknown; message?: unknown } | null;
  const reason = wiFiProvWiFiFailureReasonFromCode(value?.code);
  if (reason) return reason;
  // UNKNOWN, cancellation and any other explicit code must not be laundered
  // into a rejection by a legacy-looking message. Keep only original BLE compatibility.
  if (value?.code !== undefined && value.code !== 'WIFIPROV_DEVICE_REJECTED') return undefined;
  if (value?.message === 'Provisioning failed on the device: AUTH_FAILED') return 'AUTH_FAILED';
  if (value?.message === 'Provisioning failed on the device: NETWORK_NOT_FOUND') return 'NETWORK_NOT_FOUND';
  return undefined;
}
