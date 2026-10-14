import { Component } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { MenuListComponent } from 'src/app/core/components/menu-list/menu-list';
import { MenuItemComponent } from 'src/app/core/components/menu-list/menu-item/menu-item';
import { OrderData } from 'src/app/core/model/data.model';
import { DataService } from 'src/app/core/services/data.service';
import { RoomService, roomErrorMessage } from '../room.service';

@Component({
  selector: 'room-manager',
  templateUrl: 'room-manager.html',
  styleUrls: ['room-manager.scss'],
  imports: [
    IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar,
    MenuListComponent, MenuItemComponent,
  ],
})
export class RoomManagerPage {
  loaded = false;
  saving = false;
  editMode = false;
  error = '';
  defaultBackHref = '/home/device';
  private revision = 0;
  private sessionEpoch = -1;
  private createRequested = false;

  get roomDataList(): string[] {
    return this.dataService.room.list;
  }

  get roomDataDict(): Record<string, string[]> {
    return this.dataService.room.dict;
  }

  constructor(
    private readonly router: Router,
    private readonly roomService: RoomService,
    private readonly alertCtrl: AlertController,
    private readonly dataService: DataService,
  ) {
    const state = this.router.getCurrentNavigation()?.extras.state;

    this.createRequested = state?.['createRegion'] === true;
    if (typeof state?.['backHref'] === 'string') this.defaultBackHref = state['backHref'];
  }

  async ionViewDidEnter(): Promise<void> {
    await this.load();

    if (this.loaded && this.createRequested) {
      this.createRequested = false;
      await this.addRoom();
    }
  }

  async load(): Promise<void> {
    this.loaded = false;
    this.error = '';

    try {
      const snapshot = await this.roomService.load();

      this.revision = snapshot.revision;
      this.sessionEpoch = this.dataService.sessionEpoch;
      this.loaded = true;
    } catch (error) {
      this.error = roomErrorMessage(error);
    }
  }

  switchMode(): void {
    if (!this.saving) this.editMode = !this.editMode;
  }

  async addRoom(): Promise<void> {
    if (!this.loaded || this.saving) return;

    const alert = await this.alertCtrl.create({
      header: '新建区域',
      inputs: [{ name: 'name', placeholder: '区域名称', attributes: { maxlength: 10 } }],
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '创建',
          handler: async (data) => {
            const name = String(data.name ?? '').trim();
            const invalid = !name ? '请输入区域名称。'
              : name.length > 10 ? '区域名称最多 10 个字。'
              : this.roomDataList.includes(name) ? '该区域已存在。'
              : ['__proto__', 'constructor', 'prototype'].includes(name) ? '请使用其他区域名称。'
              : this.roomDataList.length >= 99 ? '最多创建 99 个区域。' : '';

            if (invalid) {
              alert.message = invalid;
              return false;
            }

            const draft = structuredClone(this.dataService.room);

            draft.list.push(name);
            draft.dict[name] = [];

            if (!await this.save(draft)) {
              alert.message = this.error;
              return false;
            }

            this.editRoom(name);
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  editRoom(name: string): void {
    if (!this.saving) void this.router.navigate(['room-manager', name]);
  }

  async delRoomAlert(name: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: '删除区域？',
      message: '区域内的设备不会被删除。',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '删除',
          role: 'destructive',
          handler: async () => {
            const draft = structuredClone(this.dataService.room);

            draft.list = draft.list.filter(room => room !== name);
            delete draft.dict[name];

            return this.save(draft);
          },
        },
      ],
    });

    await alert.present();
  }

  async sortChange(order: string[]): Promise<void> {
    if (JSON.stringify(order) === JSON.stringify(this.roomDataList)) return;

    await this.save({ list: order, dict: structuredClone(this.roomDataDict) });
  }

  private async save(draft: OrderData): Promise<boolean> {
    if (this.saving) return false;

    this.saving = true;
    this.error = '';

    try {
      const snapshot = await this.roomService.saveData(draft, this.revision, this.sessionEpoch);

      this.revision = snapshot.revision;
      return true;
    } catch (error) {
      this.error = roomErrorMessage(error);
      return false;
    } finally {
      this.saving = false;
    }
  }
}
