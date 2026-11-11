import { MenuListItem } from '../core/components/menu-list/menu-list';

export interface ToolMenuGroup {
  title: string;

  tools: readonly MenuListItem[];
}

export const TOOL_MENU_GROUPS: readonly ToolMenuGroup[] = [
  {
    title: 'TOOLS.GROUP_DEVICE_CONNECTION',
    tools: [
      {
        id: 'esp32-provision',
        icon: 'fa-wifi',
        title: 'TOOLS.ESP32_PROVISION_TITLE',
        description: 'TOOLS.ESP32_PROVISION_DESCRIPTION',
        route: '/tools/esp32-provision',
      },
      {
        id: 'ble-debug',
        icon: 'fa-signal-stream',
        title: 'TOOLS.BLE_DEBUG_TITLE',
        description: 'TOOLS.BLE_DEBUG_DESCRIPTION',
        route: '/tools/ble-debug',
      },
      {
        id: 'lan-discovery',
        icon: 'fa-network-wired',
        title: 'TOOLS.LAN_DISCOVERY_TITLE',
        description: 'TOOLS.LAN_DISCOVERY_DESCRIPTION',
        route: '/tools/lan-discovery',
      },
    ],
  },
  {
    title: 'TOOLS.GROUP_FIRMWARE_UPGRADE',
    tools: [
      {
        id: 'ble-ota',
        icon: 'fa-microchip',
        title: 'BLE OTA',
        description: 'TOOLS.BLE_OTA_DESCRIPTION',
        route: '/tools/ble-ota',
      },
      {
        id: 'wifi-ota',
        icon: 'fa-arrow-up-from-bracket',
        title: 'WiFi OTA',
        description: 'TOOLS.WIFI_OTA_DESCRIPTION',
        route: '/tools/wifi-ota',
      },
    ],
  },
  {
    title: 'TOOLS.GROUP_COMMUNICATION_DEBUG',
    tools: [
      {
        id: 'mqtt-client',
        icon: 'fa-satellite-dish',
        title: 'TOOLS.MQTT_CLIENT_TITLE',
        description: 'TOOLS.MQTT_CLIENT_DESCRIPTION',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
        showChevron: false,
      },
      {
        id: 'tcp-udp',
        icon: 'fa-plug',
        title: 'TCP / UDP',
        description: 'TOOLS.TCP_UDP_DESCRIPTION',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
        showChevron: false,
      },
      {
        id: 'http-websocket',
        icon: 'fa-globe',
        title: 'HTTP / WebSocket',
        description: 'TOOLS.HTTP_WEBSOCKET_DESCRIPTION',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
        showChevron: false,
      },
      {
        id: 'modbus',
        icon: 'fa-wave-pulse',
        title: 'TOOLS.MODBUS_TITLE',
        description: 'TOOLS.MODBUS_DESCRIPTION',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
        showChevron: false,
      },
    ],
  },
  {
    title: 'TOOLS.GROUP_DIAGNOSTICS',
    tools: [
      {
        id: 'network-diagnostics',
        icon: 'fa-network-wired',
        title: 'TOOLS.NETWORK_DIAGNOSTICS_TITLE',
        description: 'TOOLS.NETWORK_DIAGNOSTICS_DESCRIPTION',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
        showChevron: false,
      },
      {
        id: 'crc-hex',
        icon: 'fa-code',
        title: 'CRC / HEX',
        description: 'TOOLS.CRC_HEX_DESCRIPTION',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
        showChevron: false,
      },
      {
        id: 'scan-device-info',
        icon: 'fa-barcode-read',
        title: 'TOOLS.SCAN_DEVICE_INFO_TITLE',
        description: 'TOOLS.SCAN_DEVICE_INFO_DESCRIPTION',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
        showChevron: false,
      },
    ],
  },
];
