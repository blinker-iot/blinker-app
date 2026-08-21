import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { BlinkerDevice } from '../core/model/device.model';
import { DataService } from '../core/services/data.service';
import { DeviceV2Page } from './v2/device-v2.page';

@Component({
  selector: 'app-device',
  standalone: true,
  imports: [IonicModule, RouterModule, DeviceV2Page],
  templateUrl: './device.page.html',
  styleUrls: ['./device.page.scss'],
})
export class DevicePage implements OnInit, OnDestroy {
  loaded = false;
  device?: BlinkerDevice;

  private id = '';
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly data: DataService,
    private readonly cd: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(this.route.paramMap.subscribe(params => {
      this.id = params.get('id') ?? '';
      this.bind();
    }));
    this.subscriptions.add(this.data.initCompleted.subscribe(() => this.bind()));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private bind(): void {
    this.device = this.data.getDevice(this.id);
    this.loaded = true;
    this.cd.markForCheck();
  }
}
