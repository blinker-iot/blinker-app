/** Directory routing hint only; grants and live admission still authorize access. */
export function isGatewayRoutedDevice(device: {
  gatewayRouted?: boolean; deviceType?: string; cloudEnabled?: boolean;
} | undefined): boolean {
  if (typeof device?.gatewayRouted === 'boolean') return device.gatewayRouted;
  // Older/offline directories have no topology hint. Keep conservative admission.
  return device?.deviceType === 'ble' && device.cloudEnabled === true;
}
