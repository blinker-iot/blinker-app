import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  HostBinding,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { toastOptions } from '../../model/toast.model';
import { BDeviceImgComponent } from '../b-device-img/b-device-img.component';

@Component({
  standalone: true,
  imports: [CommonModule, BDeviceImgComponent],
  selector: 'b-toast',
  templateUrl: './b-toast.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./b-toast.component.scss'],
})
export class BToastComponent implements OnInit, OnDestroy {
  @Input() toast: toastOptions;

  @HostBinding('class.notice-collapsed') collapsed = false;

  hide = false;
  private closeTimer?: number;
  private collapseTimer?: number;

  ngOnInit() {
    const delay = Math.max(0, this.toast.delay ?? 5000);
    this.closeTimer = window.setTimeout(() => this.close(), delay + 100);
  }

  ngOnDestroy() {
    window.clearTimeout(this.closeTimer);
    window.clearTimeout(this.collapseTimer);
  }

  close() {
    if (this.hide) return;
    this.hide = true;
    this.collapseTimer = window.setTimeout(() => {
      this.collapsed = true;
    }, 220);
  }
}
