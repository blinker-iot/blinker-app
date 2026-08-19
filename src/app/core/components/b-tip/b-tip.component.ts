import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  HostBinding,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { tipOptions } from '../../model/tip.model';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'b-tip',
  templateUrl: './b-tip.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./b-tip.component.scss'],
})
export class BTipComponent implements OnInit, OnDestroy {
  @Input() tip: tipOptions;

  @HostBinding('class.notice-collapsed') collapsed = false;

  hide = false;
  private closeTimer?: number;
  private collapseTimer?: number;

  get visualType(): 'error' | 'warn' | 'success' | 'info' {
    if (this.tip.type === 'error') return 'error';
    if (this.tip.type === 'warn' || this.tip.type === 'warning') return 'warn';
    if (this.tip.type === 'done' || this.tip.type === 'success') return 'success';
    return 'info';
  }

  get iconClass(): string {
    switch (this.visualType) {
      case 'error':
        return 'fal fa-exclamation-circle';
      case 'warn':
        return 'fal fa-exclamation-triangle';
      case 'success':
        return 'fal fa-check';
      default:
        return 'fal fa-info-circle';
    }
  }

  ngOnInit() {
    const delay = Math.max(0, this.tip.delay ?? 5000);
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
