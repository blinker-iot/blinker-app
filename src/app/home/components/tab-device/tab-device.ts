import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { RoomListComponent } from '../room-list/room-list';
import { DeviceblockZone } from '../deviceblock-zone/deviceblock-zone';
import { DataService } from '../../../core/services/data.service';
import { DeviceService } from '../../../core/services/device.service';

@Component({
  selector: 'tab-device',
  templateUrl: 'tab-device.html',
  styleUrls: ['tab-device.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    RoomListComponent,
    DeviceblockZone,
  ],
})
export class TabDeviceComponent implements OnInit {
  private _roomid = -1;

  @Input()
  set roomid(roomid: number) {
    this._roomid = roomid;
  }

  get roomid() {
    return this._roomid;
  }

  @Output() roomidChange = new EventEmitter<number>();

  get deviceNum() {
    return this.dataService.device?.list?.length || 0;
  }

  constructor(
    private dataService: DataService,
    private deviceService: DeviceService,
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef,
  ) {}

  ngOnInit() {
    this.dataService.userDataLoader
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state) this.deviceService.queryDevices();
        this.cd.markForCheck();
      });
  }

  onRoomidChange(value: number) {
    this._roomid = value;
    this.roomidChange.emit(value);
    this.cd.markForCheck();
  }

}
