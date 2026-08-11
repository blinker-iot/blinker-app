import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';

interface ToolItem {
  title: string;
  description: string;
  icon: string;
  route?: string;
  badge?: string;
}

interface ToolGroup {
  title: string;
  tools: ToolItem[];
}

@Component({
  selector: 'app-tab-tools',
  templateUrl: 'tab-tools.html',
  styleUrls: ['tab-tools.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class TabToolsComponent implements OnInit {
  readonly groups: ToolGroup[] = [
    {
      title: '设备与连接',
      tools: [
        {
          title: 'ESP32 配网',
          description: 'BLE / SoftAP · 安全配置 2.4 GHz Wi-Fi',
          icon: 'fa-wifi',
          route: '/tools/esp32-provision',
        },
        {
          title: '蓝牙 BLE 调试',
          description: '扫描设备、GATT 读写与 Notify',
          icon: 'fa-bluetooth',
          route: '/tools/ble-debug',
        },
        {
          title: '局域网发现',
          description: '通过 mDNS / Bonjour 发现同网服务',
          icon: 'fa-radar',
          route: '/tools/lan-discovery',
        },
      ],
    },
    {
      title: '通信调试',
      tools: [
        {
          title: 'MQTT 客户端',
          description: '连接 Broker，发布与订阅 Topic',
          icon: 'fa-share-nodes',
          badge: '即将上线',
        },
        {
          title: 'TCP / UDP',
          description: '创建客户端或服务端连接',
          icon: 'fa-terminal',
          badge: '即将上线',
        },
        {
          title: 'HTTP / WebSocket',
          description: '发送请求并调试实时连接',
          icon: 'fa-code',
          badge: '即将上线',
        },
        {
          title: 'Modbus 调试',
          description: '支持 RTU 与 TCP 数据读写',
          icon: 'fa-server',
          badge: '即将上线',
        },
      ],
    },
    {
      title: '固件升级',
      tools: [
        {
          title: 'BLE OTA',
          description: '通过蓝牙为设备升级应用固件或文件系统',
          icon: 'fa-cloud-arrow-up',
          route: '/tools/ble-ota',
        },
        {
          title: 'WiFi OTA',
          description: '发现局域网设备并通过 HTTP 上传固件',
          icon: 'fa-wifi',
          route: '/tools/wifi-ota',
        },
      ],
    },
    {
      title: '诊断与辅助',
      tools: [
        {
          title: '网络诊断',
          description: 'Ping、DNS、路由与端口检测',
          icon: 'fa-wave-pulse',
          badge: '即将上线',
        },
        {
          title: 'CRC / HEX',
          description: '校验计算与数据格式转换',
          icon: 'fa-brackets-curly',
          badge: '即将上线',
        },
        {
          title: '扫码与设备信息',
          description: '读取二维码、MAC 与芯片信息',
          icon: 'fa-qrcode',
          badge: '即将上线',
        },
      ],
    },
  ];

  searchVisible = false;
  recentOnly = false;
  searchKeyword = '';
  private recentRoutes: string[] = [];

  constructor(
    private router: Router,
    private toastController: ToastController
  ) {}

  ngOnInit(): void {
    try {
      this.recentRoutes = JSON.parse(localStorage.getItem('toolRecentRoutes') || '[]');
    } catch {
      this.recentRoutes = [];
    }
  }

  get visibleGroups(): ToolGroup[] {
    const keyword = this.searchKeyword.trim().toLowerCase();

    return this.groups
      .map(group => ({
        ...group,
        tools: group.tools.filter(tool => {
          const matchesKeyword = !keyword ||
            `${tool.title} ${tool.description}`.toLowerCase().includes(keyword);
          const matchesRecent = !this.recentOnly ||
            (!!tool.route && this.recentRoutes.includes(tool.route));
          return matchesKeyword && matchesRecent;
        }),
      }))
      .filter(group => group.tools.length > 0);
  }

  toggleSearch(): void {
    this.searchVisible = !this.searchVisible;
    if (!this.searchVisible) this.searchKeyword = '';
  }

  toggleRecent(): void {
    this.recentOnly = !this.recentOnly;
  }

  async openTool(tool: ToolItem): Promise<void> {
    if (!tool.route) {
      const toast = await this.toastController.create({
        message: `${tool.title}即将上线`,
        duration: 1600,
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    this.recentRoutes = [
      tool.route,
      ...this.recentRoutes.filter(route => route !== tool.route),
    ].slice(0, 6);
    localStorage.setItem('toolRecentRoutes', JSON.stringify(this.recentRoutes));
    await this.router.navigateByUrl(tool.route);
  }
}
