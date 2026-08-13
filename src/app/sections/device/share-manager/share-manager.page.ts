import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import { ShareDate } from 'src/app/core/model/data.model';
import { DataService } from 'src/app/core/services/data.service';
import { UserService } from 'src/app/core/services/user.service';
import { ShareService } from '../device-share/share.service';

@Component({
  selector: 'app-share-manager',
  standalone: true,
  templateUrl: './share-manager.page.html',
  styleUrls: ['./share-manager.page.scss'],
  imports: [IonicModule, RouterModule, TranslatePipe, BDeviceImgComponent],
})
export class ShareManagerPage implements OnInit, OnDestroy {
  loaded = false;
  tab: 'sharing' | 'received' = 'sharing';
  sharedSelected = -1;
  pendingAcceptSelected = -1;
  pendingRefuseSelected = -1;

  private userDataSubscription?: Subscription;

  get deviceDataDict() {
    return this.dataService.device?.dict ?? {};
  }

  get deviceDataList(): string[] {
    return this.dataService.device?.list ?? [];
  }

  get shareData(): ShareDate {
    return this.ensureShareData();
  }

  get shareableDeviceList(): string[] {
    return this.deviceDataList.filter(
      (deviceId) => !this.isReceivedDevice(deviceId)
    );
  }

  get sharedByMeCount(): number {
    return new Set([
      ...Object.keys(this.shareData.share),
      ...Object.keys(this.shareData.share0),
    ]).size;
  }

  constructor(
    private readonly shareService: ShareService,
    private readonly dataService: DataService,
    private readonly userService: UserService
  ) {}

  ngOnInit(): void {
    this.ensureShareData();
    this.loaded = Boolean(this.dataService.device);

    this.userDataSubscription = this.dataService.userDataLoader.subscribe(
      (loaded) => {
        if (loaded) void this.loadShareList();
      }
    );
  }

  ngOnDestroy(): void {
    this.userDataSubscription?.unsubscribe();
  }

  changeTab(tab: 'sharing' | 'received'): void {
    this.tab = tab;
  }

  isReceivedDevice(deviceId: string): boolean {
    return this.shareData.shared.some((item) => item.deviceName === deviceId);
  }

  async accept(taskId: string, index: number): Promise<void> {
    this.pendingAcceptSelected = index;
    try {
      if (await this.shareService.acceptSharedDevice(taskId)) {
        await this.userService.getAllInfo();
      }
    } finally {
      this.pendingAcceptSelected = -1;
    }
  }

  async refuse(taskId: string, index: number): Promise<void> {
    this.pendingRefuseSelected = index;
    try {
      await this.shareService.refuseSharedDevice(taskId);
    } finally {
      this.pendingRefuseSelected = -1;
    }
  }

  async cancel(deviceName: string, index: number): Promise<void> {
    this.sharedSelected = index;
    try {
      await this.shareService.deleteSharedDevice(deviceName);
    } finally {
      this.sharedSelected = -1;
    }
  }

  private async loadShareList(): Promise<void> {
    try {
      if (this.dataService.auth?.uuid && this.dataService.auth?.token) {
        await this.shareService.getShareList();
      }
      if (this.shareData.shared0.length > 0) {
        this.tab = 'received';
      }
    } finally {
      this.loaded = true;
    }
  }

  private ensureShareData(): ShareDate {
    if (!this.dataService.share) {
      this.dataService.share = {
        share: {},
        share0: {},
        shared: [],
        shared0: [],
      };
    }
    return this.dataService.share;
  }
}
