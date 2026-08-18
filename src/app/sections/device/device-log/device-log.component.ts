import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { HeroCardComponent } from 'src/app/core/components/hero-card/hero-card.component';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { DataService } from 'src/app/core/services/data.service';

type LogType = 'system' | 'device' | 'user' | 'warning';

interface RuntimeLog {
  id: string;
  date: Date;
  type: LogType;
  title: string;
  detail: string;
}

interface LogFilter {
  id: 'all' | LogType;
  label: string;
}

function createTestLogs(): RuntimeLog[] {
  const now = Date.now();
  const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000);

  return [
    {
      id: 'test-online',
      date: minutesAgo(2),
      type: 'system',
      title: '设备上线',
      detail: 'MQTT 连接已建立，信号质量良好',
    },
    {
      id: 'test-temperature',
      date: minutesAgo(8),
      type: 'device',
      title: '温度数据上报',
      detail: 'temperature = 24.6 °C',
    },
    {
      id: 'test-switch',
      date: minutesAgo(18),
      type: 'user',
      title: '执行开关操作',
      detail: '用户将设备开关设置为 ON',
    },
    {
      id: 'test-network',
      date: minutesAgo(43),
      type: 'warning',
      title: '网络短暂波动',
      detail: '连接中断 3 秒后自动恢复',
    },
    {
      id: 'test-timer',
      date: minutesAgo(75),
      type: 'user',
      title: '定时任务已执行',
      detail: '工作日节能模式执行成功',
    },
    {
      id: 'test-restart',
      date: minutesAgo(132),
      type: 'system',
      title: '设备重新启动',
      detail: '启动原因：软件复位',
    },
  ];
}

@Component({
  selector: 'app-device-log',
  templateUrl: './device-log.component.html',
  styleUrls: ['./device-log.component.scss'],
  imports: [CommonModule, FormsModule, IonicModule, HeroCardComponent],
})
export class DeviceLogComponent implements OnInit, OnDestroy {
  readonly filters: readonly LogFilter[] = [
    { id: 'all', label: '全部' },
    { id: 'system', label: '系统' },
    { id: 'device', label: '设备' },
    { id: 'user', label: '操作' },
    { id: 'warning', label: '异常' },
  ];

  id = '';
  device?: BlinkerDevice;
  loaded = false;
  usingTestData = false;
  selectedType: LogFilter['id'] = 'all';
  searchText = '';
  logs: RuntimeLog[] = [];
  lastRefreshed = new Date();

  private subscription?: Subscription;

  get defaultBackHref(): string {
    return `/device-manager/${this.id}`;
  }

  get deviceName(): string {
    return this.device?.config?.customName || '设备';
  }

  get visibleLogs(): RuntimeLog[] {
    const keyword = this.searchText.trim().toLocaleLowerCase();
    return this.logs.filter((log) => {
      const typeMatches = this.selectedType === 'all' || log.type === this.selectedType;
      const textMatches =
        !keyword ||
        `${log.title} ${log.detail}`.toLocaleLowerCase().includes(keyword);
      return typeMatches && textMatches;
    });
  }

  get warningCount(): number {
    return this.logs.filter((log) => log.type === 'warning').length;
  }

  constructor(
    private readonly dataService: DataService,
    private readonly activatedRoute: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.id = this.activatedRoute.snapshot.paramMap.get('id') || '';
    this.bindDevice();
    this.subscription = this.dataService.userDataLoader.subscribe((loaded) => {
      if (loaded) this.bindDevice();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  selectType(type: LogFilter['id']): void {
    this.selectedType = type;
  }

  typeLabel(type: LogType): string {
    return {
      system: '系统',
      device: '设备',
      user: '操作',
      warning: '异常',
    }[type];
  }

  refreshLogs(): void {
    this.lastRefreshed = new Date();
    if (!this.usingTestData) {
      this.bindDevice();
      return;
    }

    this.logs = [
      {
        id: `test-refresh-${Date.now()}`,
        date: this.lastRefreshed,
        type: 'system',
        title: '日志刷新完成',
        detail: '这是一条用于验证实时列表样式的测试记录',
      },
      ...this.logs,
    ];
  }

  private bindDevice(): void {
    this.device = this.dataService.device?.dict?.[this.id];
    this.loaded = Boolean(this.device);
    if (!this.device) return;

    const rawLogs = this.findRawLogs();
    if (rawLogs.length) {
      this.logs = rawLogs.map((log, index) => this.normalizeLog(log, index));
      this.usingTestData = false;
    } else if (!this.logs.length || !this.usingTestData) {
      this.logs = createTestLogs();
      this.usingTestData = true;
    }
  }

  private findRawLogs(): unknown[] {
    const data = this.device?.data;
    const candidates = [data?.runtimeLogs, data?.logs, data?.log];
    return candidates.find((candidate) => Array.isArray(candidate)) || [];
  }

  private normalizeLog(raw: unknown, index: number): RuntimeLog {
    const entry = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const rawType = String(entry['type'] || 'device');
    const type: LogType = ['system', 'device', 'user', 'warning'].includes(rawType)
      ? (rawType as LogType)
      : 'device';
    const rawDate = entry['date'] || entry['timestamp'] || entry['time'];
    const date = rawDate ? new Date(rawDate as string | number) : new Date();

    return {
      id: String(entry['id'] || `${date.getTime()}-${index}`),
      date: Number.isNaN(date.getTime()) ? new Date() : date,
      type,
      title: String(entry['title'] || entry['event'] || '设备记录'),
      detail: String(entry['detail'] || entry['data'] || entry['message'] || '—'),
    };
  }
}
