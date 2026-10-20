import { isGatewayRoutedDevice } from './device-routing';

describe('device directory routing hint', () => {
  it('does not confuse BLE-origin native WiFi with a gateway child', () => {
    expect(isGatewayRoutedDevice({ deviceType: 'ble', cloudEnabled: true, gatewayRouted: false })).toBe(false);
  });
  it('retains gateway admission regardless of original type or its own cloud capability', () => {
    expect(isGatewayRoutedDevice({ deviceType: 'diy', cloudEnabled: true, gatewayRouted: true })).toBe(true);
  });
  it('keeps old/unknown BLE cloud catalogs conservative', () => {
    expect(isGatewayRoutedDevice({ deviceType: 'ble', cloudEnabled: true })).toBe(true);
    expect(isGatewayRoutedDevice({ deviceType: 'ble', cloudEnabled: false })).toBe(false);
    expect(isGatewayRoutedDevice(undefined)).toBe(false);
  });
});
