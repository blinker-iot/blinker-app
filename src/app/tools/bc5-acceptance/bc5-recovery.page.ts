import { ChangeDetectionStrategy, Component, inject, signal, type OnDestroy, type OnInit } from '@angular/core';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import type { Bc5AcceptanceAdmission } from '../../core/device-v2/ble-direct/bc5-acceptance-client';
import { readBc5RecoveryProfile } from '../../core/device-v2/ble-direct/bc5-launch-profile';
import { bc5PresenceRecoveryStop } from '../../core/device-v2/ble-direct/bc5-registered-presence';
import { DeviceV2BleService } from '../../core/services/device-v2-ble.service';

@Component({
  selector: 'app-bc5-recovery', changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
  template: `
    <ion-header class="tool-page-header"><ion-toolbar>
      <ion-buttons slot="start"><ion-back-button defaultHref="/home/device" text="返回" /></ion-buttons>
      <ion-title>恢复附近状态</ion-title>
    </ion-toolbar></ion-header>
    <ion-content class="ion-padding">
      <main>
        <p>仅恢复本机设备卡片的蓝牙附近状态引用，不连接设备、不更改授权。</p>
        @if (profile()) {
          <ion-button expand="block" [disabled]="attempted()" (click)="restore()">恢复附近状态引用</ion-button>
        }
        <p role="status" aria-atomic="true">{{ status() }}</p>
      </main>
    </ion-content>`,
  styles: [`
    main { max-inline-size: 35rem; margin-inline: auto; }
    ion-button { min-block-size: 48px; }
    [role="status"] { min-block-size: 3em; }
  `],
})
export class Bc5RecoveryPage implements OnInit, OnDestroy {
  private readonly ble = inject(DeviceV2BleService);
  private operation?: AbortController;
  private destroyed = false;
  protected readonly profile = signal<Bc5AcceptanceAdmission | undefined>(undefined);
  protected readonly attempted = signal(false);
  protected readonly status = signal('正在核对恢复配置…');

  async ngOnInit(): Promise<void> {
    const profile = await readBc5RecoveryProfile().catch(() => undefined);
    if (this.destroyed) return;
    this.profile.set(profile);
    this.status.set(profile ? '就绪。确认后核对原安装结果。' : '本次恢复入口不可用，请返回设备列表。');
  }

  protected async restore(): Promise<void> {
    const profile = this.profile();
    if (!profile || this.attempted() || this.destroyed) return;
    this.attempted.set(true);
    const owner = this.operation = new AbortController();
    this.status.set('正在核对原安装结果并恢复本机引用…');
    try {
      const saved = await this.ble.restoreCommittedBc5PresenceAlias(profile, owner.signal);
      if (!owner.signal.aborted) this.status.set(saved
        ? '本机引用已恢复。请返回设备列表；恢复不代表设备已在附近或已上线。'
        : '本机已有匹配引用。请返回设备列表；设备当前状态以列表为准。');
    } catch (error) {
      if (!owner.signal.aborted) {
        const { stage, reason } = bc5PresenceRecoveryStop(error);
        console.warn('BC5_RECOVERY_STOP', stage, reason);
        this.status.set('未确认恢复。请返回设备列表；没有自动重试。');
      }
    } finally { this.operation = undefined; }
  }

  ionViewWillLeave(): void {
    if (!this.operation) return;
    this.operation.abort();
    this.status.set('已停止等待。请返回设备列表检查当前状态。');
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.ionViewWillLeave();
  }
}
