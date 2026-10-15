import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import {
  AlertController, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, NavController,
} from '@ionic/angular/standalone';

import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import { OrderData } from 'src/app/core/model/data.model';
import { DataService } from 'src/app/core/services/data.service';
import { RoomService, roomErrorMessage } from '../room.service';

@Component({
  selector: 'page-room-edit',
  standalone: true,
  templateUrl: 'room-edit.html',
  styleUrls: ['room-edit.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, BDeviceImgComponent],
})

export class RoomEditPage implements OnInit {
  roomName = '';
  loaded = false;
  saving = false;
  error = '';
  private draft: OrderData = { list: [], dict: {} };
  private revision = 0;
  private sessionEpoch = -1;

  get deviceDataDict() {
    return this.dataService.device.dict;
  }

  get deviceDataList(): string[] {
    return this.dataService.device.list;
  }

  get currentRoomData(): string[] {
    return this.draft.dict[this.roomName] ?? [];
  }

  constructor(
    private readonly dataService: DataService,
    private readonly roomService: RoomService,
    private readonly alertCtrl: AlertController,
    private readonly activatedRoute: ActivatedRoute,
    private readonly nav: NavController,
  ) {}

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loaded = false;
    this.error = '';

    try {
      const snapshot = await this.roomService.load();
      const name = this.activatedRoute.snapshot.params['room'];

      if (!Object.hasOwn(snapshot.rooms, name)) {
        this.error = '该区域已被删除，请返回区域列表。';

        return;
      }

      this.draft = { list: [...snapshot.order], dict: structuredClone(snapshot.rooms) };
      this.revision = snapshot.revision;
      this.sessionEpoch = this.dataService.sessionEpoch;
      this.roomName = name;
      this.loaded = true;
    } catch (error) {
      this.error = roomErrorMessage(error);
    }
  }

  async changeRoomName(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: '区域名称',
      inputs: [{ name: 'name', value: this.roomName, attributes: { maxlength: 10 } }],
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '确定',
          handler: (data) => {
            const name = String(data.name ?? '').trim();

            if (!name || name.length > 10 || ['__proto__', 'constructor', 'prototype'].includes(name)) {
              alert.message = '请输入 1–10 个字的有效区域名称。';

              return false;
            }

            if (name === this.roomName) return true;

            if (this.draft.list.includes(name)) {
              alert.message = '该区域名称已存在。';

              return false;
            }

            const index = this.draft.list.indexOf(this.roomName);

            this.draft.list[index] = name;
            this.draft.dict[name] = this.currentRoomData;

            delete this.draft.dict[this.roomName];

            this.roomName = name;

            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  isSelected(deviceId: string): boolean {
    return this.currentRoomData.includes(deviceId);
  }

  toggleDevice(deviceId: string): void {
    if (this.saving) return;

    this.draft.dict[this.roomName] = this.isSelected(deviceId)
      ? this.currentRoomData.filter(id => id !== deviceId)
      : [...this.currentRoomData, deviceId];
  }

  async save(): Promise<void> {
    if (!this.loaded || this.saving) return;

    this.saving = true;
    this.error = '';

    try {
      await this.roomService.saveData(this.draft, this.revision, this.sessionEpoch);
      await this.nav.navigateBack('/room-manager');
    } catch (error) {
      this.error = roomErrorMessage(error);
    } finally {
      this.saving = false;
    }
  }

  cancel(): void {
    if (!this.saving) void this.nav.navigateBack('/room-manager');
  }
}
