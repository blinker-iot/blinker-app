import { MenuListItem } from '../core/components/menu-list/menu-list';

export interface ToolMenuGroup {
  title: string;
  tools: readonly MenuListItem[];
}

export const TOOL_MENU_GROUPS: readonly ToolMenuGroup[] = [
  {
    title: '设备与连接',
    tools: [
      {
        id: 'esp32-provision',
        title: 'ESP32 配网',
        description: 'BLE / SoftAP · 安全配置 2.4 GHz Wi-Fi',
        icon: 'fa-wifi',
        route: '/tools/esp32-provision',
      },
      {
        id: 'ble-debug',
        title: '蓝牙 BLE 调试',
        description: '扫描设备、GATT 读写与 Notify',
        icon: 'fa-bluetooth',
        route: '/tools/ble-debug',
      },
      {
        id: 'lan-discovery',
        title: '局域网发现',
        description: '通过 mDNS / Bonjour 发现同网服务',
        icon: 'fa-radar',
        route: '/tools/lan-discovery',
      },
    ],
  },
  {
    title: '固件升级',
    tools: [
      {
        id: 'ble-ota',
        title: 'BLE OTA',
        description: '通过蓝牙为设备升级应用固件或文件系统',
        icon: 'fa-cloud-arrow-up',
        route: '/tools/ble-ota',
      },
      {
        id: 'wifi-ota',
        title: 'WiFi OTA',
        description: '发现局域网设备并通过 HTTP 上传固件',
        icon: 'fa-wifi',
        route: '/tools/wifi-ota',
      },
    ],
  },
  {
    title: '通信调试',
    tools: [
      {
        id: 'mqtt-client',
        title: 'MQTT 客户端',
        description: '连接 Broker，发布与订阅 Topic',
        icon: 'fa-share-nodes',
        badge: '即将上线',
        muted: true,
      },
      {
        id: 'tcp-udp',
        title: 'TCP / UDP',
        description: '创建客户端或服务端连接',
        icon: 'fa-terminal',
        badge: '即将上线',
        muted: true,
      },
      {
        id: 'http-websocket',
        title: 'HTTP / WebSocket',
        description: '发送请求并调试实时连接',
        icon: 'fa-code',
        badge: '即将上线',
        muted: true,
      },
      {
        id: 'modbus',
        title: 'Modbus 调试',
        description: '支持 RTU 与 TCP 数据读写',
        icon: 'fa-server',
        badge: '即将上线',
        muted: true,
      },
    ],
  },
  {
    title: '诊断与辅助',
    tools: [
      {
        id: 'network-diagnostics',
        title: '网络诊断',
        description: 'Ping、DNS、路由与端口检测',
        icon: 'fa-wave-pulse',
        badge: '即将上线',
        muted: true,
      },
      {
        id: 'crc-hex',
        title: 'CRC / HEX',
        description: '校验计算与数据格式转换',
        icon: 'fa-brackets-curly',
        badge: '即将上线',
        muted: true,
      },
      {
        id: 'scan-device-info',
        title: '扫码与设备信息',
        description: '读取二维码、MAC 与芯片信息',
        icon: 'fa-qrcode',
        badge: '即将上线',
        muted: true,
      },
    ],
  },
];
