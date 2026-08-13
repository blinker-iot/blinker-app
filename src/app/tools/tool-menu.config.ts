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
        title: 'TOOLS.ESP32_PROVISION_TITLE',
        description: 'TOOLS.ESP32_PROVISION_DESCRIPTION',
        icon: 'fa-wifi',
        route: '/tools/esp32-provision',
      },
      {
        id: 'ble-debug',
        title: 'TOOLS.BLE_DEBUG_TITLE',
        description: 'TOOLS.BLE_DEBUG_DESCRIPTION',
        icon: 'fa-bluetooth',
        route: '/tools/ble-debug',
      },
      {
        id: 'lan-discovery',
        title: 'TOOLS.LAN_DISCOVERY_TITLE',
        description: 'TOOLS.LAN_DISCOVERY_DESCRIPTION',
        icon: 'fa-radar',
        route: '/tools/lan-discovery',
      },
    ],
  },
  {
    title: 'TOOLS.GROUP_FIRMWARE_UPGRADE',
    tools: [
      {
        id: 'ble-ota',
        title: 'BLE OTA',
        description: 'TOOLS.BLE_OTA_DESCRIPTION',
        icon: 'fa-cloud-arrow-up',
        route: '/tools/ble-ota',
      },
      {
        id: 'wifi-ota',
        title: 'WiFi OTA',
        description: 'TOOLS.WIFI_OTA_DESCRIPTION',
        icon: 'fa-wifi',
        route: '/tools/wifi-ota',
      },
    ],
  },
  {
    title: 'TOOLS.GROUP_COMMUNICATION_DEBUG',
    tools: [
      {
        id: 'mqtt-client',
        title: 'TOOLS.MQTT_CLIENT_TITLE',
        description: 'TOOLS.MQTT_CLIENT_DESCRIPTION',
        icon: 'fa-share-nodes',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
      },
      {
        id: 'tcp-udp',
        title: 'TCP / UDP',
        description: 'TOOLS.TCP_UDP_DESCRIPTION',
        icon: 'fa-terminal',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
      },
      {
        id: 'http-websocket',
        title: 'HTTP / WebSocket',
        description: 'TOOLS.HTTP_WEBSOCKET_DESCRIPTION',
        icon: 'fa-code',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
      },
      {
        id: 'modbus',
        title: 'TOOLS.MODBUS_TITLE',
        description: 'TOOLS.MODBUS_DESCRIPTION',
        icon: 'fa-server',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
      },
    ],
  },
  {
    title: 'TOOLS.GROUP_DIAGNOSTICS',
    tools: [
      {
        id: 'network-diagnostics',
        title: 'TOOLS.NETWORK_DIAGNOSTICS_TITLE',
        description: 'TOOLS.NETWORK_DIAGNOSTICS_DESCRIPTION',
        icon: 'fa-wave-pulse',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
      },
      {
        id: 'crc-hex',
        title: 'CRC / HEX',
        description: 'TOOLS.CRC_HEX_DESCRIPTION',
        icon: 'fa-brackets-curly',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
      },
      {
        id: 'scan-device-info',
        title: 'TOOLS.SCAN_DEVICE_INFO_TITLE',
        description: 'TOOLS.SCAN_DEVICE_INFO_DESCRIPTION',
        icon: 'fa-qrcode',
        badge: 'TOOLS.COMING_SOON',
        muted: true,
      },
    ],
  },
];
