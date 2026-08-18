import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonicModule, NavController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { HeroCardComponent } from 'src/app/core/components/hero-card/hero-card.component';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { NoticeService } from 'src/app/core/services/notice.service';

type UpdateState = -2 | -1 | 0 | 1 | 99 | 100;
type UpdateTone = 'ready' | 'current' | 'working' | 'success' | 'error' | 'offline';

interface UpdateStateMeta {
  title: string;
  description: string;
  icon: string;
  tone: UpdateTone;
}

@Component({
  selector: 'app-device-update',
  templateUrl: 'device-update.html',
  styleUrls: ['device-update.scss'],
  imports: [IonicModule, HeroCardComponent],
})
export class DeviceUpdatePage implements OnInit, OnDestroy {
  readonly debugStates: readonly { state: UpdateState; label: string }[] = [
    { state: 0, label: '可更新' },
    { state: 1, label: '下载中' },
    { state: 99, label: '安装中' },
    { state: 100, label: '已完成' },
    { state: -1, label: '更新失败' },
  ];

  id = '';
  device?: BlinkerDevice;
  loaded = false;
  checking = false;
  usingTestData = false;
  updateState: UpdateState = 0;
  progress = 0;

  private subscription?: Subscription;
  private pollTimer?: ReturnType<typeof setInterval>;
  private simulationTimer?: ReturnType<typeof setInterval>;
  private initializedDeviceId = '';

  get defaultBackHref(): string {
    return `/device-manager/${this.id}`;
  }

  get deviceName(): string {
    return this.device?.config?.customName || '设备';
  }

  get currentVersion(): string {
    return String(this.device?.data?.version || '1.4.2');
  }

  get latestVersion(): string {
    return String(this.device?.data?.newVersion || '1.6.0');
  }

  get releaseDescription(): string {
    return String(
      this.device?.data?.newVersionDescription ||
        '优化设备连接稳定性，降低待机功耗，并修复少量已知问题。',
    );
  }

  get deviceEnable(): boolean {
    return Boolean(this.device?.data?.enable);
  }

  get hasNewVersion(): boolean {
    if (this.updateState === 100) return false;
    const value = this.device?.data?.hasNewVersion;
    return typeof value === 'boolean' ? value : this.usingTestData;
  }

  get isWorking(): boolean {
    return this.updateState === 1 || this.updateState === 99;
  }

  get canUpdate(): boolean {
    return (
      this.updateState === 0 &&
      this.hasNewVersion &&
      (this.deviceEnable || this.usingTestData)
    );
  }

  get stateMeta(): UpdateStateMeta {
    if (!this.deviceEnable && !this.usingTestData && this.updateState === 0) {
      return {
        title: '设备当前离线',
        description: '请先让设备上线，再检查或安装固件更新。',
        icon: 'fa-cloud-slash',
        tone: 'offline',
      };
    }

    if (this.updateState === 1) {
      return {
        title: '正在下载固件',
        description: '请保持设备联网，下载期间不要关闭设备电源。',
        icon: 'fa-cloud-arrow-down',
        tone: 'working',
      };
    }
    if (this.updateState === 99) {
      return {
        title: '正在安装更新',
        description: '设备可能自动重启，请勿断电或进行其他操作。',
        icon: 'fa-gears',
        tone: 'working',
      };
    }
    if (this.updateState === 100) {
      return {
        title: '固件更新完成',
        description: `设备已升级到 ${this.latestVersion}，现在可以正常使用。`,
        icon: 'fa-circle-check',
        tone: 'success',
      };
    }
    if (this.updateState === -2) {
      return {
        title: '固件下载失败',
        description: '请检查设备网络连接，然后重新尝试更新。',
        icon: 'fa-circle-xmark',
        tone: 'error',
      };
    }
    if (this.updateState === -1) {
      return {
        title: '固件安装失败',
        description: '设备未能完成升级，请稍后重新尝试。',
        icon: 'fa-circle-xmark',
        tone: 'error',
      };
    }
    if (this.hasNewVersion) {
      return {
        title: '发现新版本',
        description: `${this.latestVersion} 已准备好，可以立即更新。`,
        icon: 'fa-cloud-arrow-up',
        tone: 'ready',
      };
    }
    return {
      title: '已是最新版本',
      description: '当前没有可用更新，设备固件处于最新状态。',
      icon: 'fa-shield-check',
      tone: 'current',
    };
  }

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly deviceService: DeviceService,
    private readonly dataService: DataService,
    private readonly noticeService: NoticeService,
    private readonly navController: NavController,
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
    this.stopTimers();
  }

  async refreshStatus(): Promise<void> {
    if (!this.device || this.checking || this.usingTestData) return;

    this.checking = true;
    try {
      this.deviceService.queryDevice(this.device);
      const [state] = await Promise.all([
        this.deviceService.checkDeviceUpdate(this.device),
        this.deviceService.checkDeviceNewVersion(this.device),
      ]);
      if (typeof state === 'number') this.applyState(state);
    } finally {
      this.checking = false;
    }
  }

  updateDevice(): void {
    if (!this.device || (!this.canUpdate && this.updateState >= 0)) return;

    if (this.usingTestData) {
      this.startSimulation();
      return;
    }

    this.deviceService.sendData(this.device, '{"set":{"upgrade":true}}');
    this.applyState(1);
    this.startPolling();
  }

  setDebugState(state: UpdateState): void {
    if (!this.usingTestData) return;
    this.stopTimers();
    if (this.device) this.device.data.hasNewVersion = state !== 100;
    this.applyState(state);
    this.progress = state === 1 ? 38 : state === 99 ? 76 : state === 100 ? 100 : 0;
  }

  finish(): void {
    void this.navController.navigateBack(this.defaultBackHref);
  }

  private bindDevice(): void {
    this.device = this.dataService.device?.dict?.[this.id];
    this.loaded = Boolean(this.device);
    if (!this.device) return;

    this.device.data ||= {};
    this.usingTestData = Boolean(this.device.config?.isPreview || !this.device.data.version);

    const storedState = Number(this.device.data?.upgradeData?.step);
    if (this.initializedDeviceId !== this.id) {
      this.updateState = this.isUpdateState(storedState) ? storedState : 0;
      this.progress = this.updateState === 100 ? 100 : 0;
      this.initializedDeviceId = this.id;
      if (!this.usingTestData) void this.refreshStatus();
    }
  }

  private startSimulation(): void {
    this.stopTimers();
    this.progress = 5;
    this.applyState(1);
    this.simulationTimer = setInterval(() => {
      this.progress = Math.min(100, this.progress + 5);
      if (this.progress >= 60 && this.progress < 100) this.applyState(99);
      if (this.progress >= 100) {
        this.applyState(100);
        if (this.device) {
          this.device.data.version = this.latestVersion;
          this.device.data.hasNewVersion = false;
        }
        if (this.simulationTimer) clearInterval(this.simulationTimer);
        this.simulationTimer = undefined;
      }
    }, 350);
  }

  private startPolling(): void {
    if (!this.device) return;
    if (this.pollTimer) clearInterval(this.pollTimer);

    let attempts = 0;
    this.pollTimer = setInterval(async () => {
      if (!this.device) return;
      const state = await this.deviceService.checkDeviceUpdate(this.device);
      attempts += 1;
      if (typeof state === 'number' && this.isUpdateState(state)) {
        this.applyState(state);
        if (state === 100 || state < 0) {
          if (this.pollTimer) clearInterval(this.pollTimer);
          this.pollTimer = undefined;
        }
      } else if (attempts >= 12) {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = undefined;
        this.applyState(-1);
        void this.noticeService.showToast('更新状态查询超时，请稍后重试');
      }
    }, 9000);
  }

  private applyState(state: number): void {
    if (!this.isUpdateState(state)) return;
    this.updateState = state;
    if (this.device) {
      this.device.data.upgradeData ||= {};
      this.device.data.upgradeData.step = state;
      if (state === 100) this.device.data.hasNewVersion = false;
    }
  }

  private isUpdateState(state: number): state is UpdateState {
    return [-2, -1, 0, 1, 99, 100].includes(state);
  }

  private stopTimers(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.simulationTimer) clearInterval(this.simulationTimer);
    this.pollTimer = undefined;
    this.simulationTimer = undefined;
  }
}
