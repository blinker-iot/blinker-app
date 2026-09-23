import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs';
import { legacyImportPath } from '../../../core/model/legacy-import.model';
import { DataService } from '../../../core/services/data.service';
import { LegacyImportService } from '../../../core/services/legacy-import.service';

@Component({
  selector: 'app-legacy-import-cards',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <a routerLink="/legacy-device-migration">从旧账号同步设备</a>
    @if (error) { <p role="alert">{{ error }} <button type="button" (click)="refresh()">重试</button></p> }
    @for (record of imports.records | async; track path(record)) {
      @if (!record.logicalDeviceId) {
        <a class="source" [routerLink]="path(record)">
          <strong>{{ record.snapshot.displayName || record.snapshot.deviceName }}</strong>
          <span>已同步，待接入{{ record.snapshot.disabled ? ' · 已禁用' : '' }}</span>
          @if (record.snapshot.issues?.length) { <span>资料有未完成项，点击核对</span> }
        </a>
      }
    }
  `,
  styles: [`
    :host { display: block; margin: 20px 0; }
    .source { display: block; margin-top: 12px; padding: 18px; border: 1px solid var(--ion-color-light-shade); border-radius: 16px; text-decoration: none; }
    .source span { display: block; margin-top: 6px; color: var(--ion-color-medium); font-size: 13px; }
  `],
})
export class LegacyImportCards implements OnInit {
  error = '';
  readonly path = legacyImportPath;
  constructor(
    readonly imports: LegacyImportService,
    private readonly data: DataService,
    private readonly router: Router,
    private readonly destroyRef: DestroyRef,
  ) {}
  ngOnInit(): void {
    void this.refresh();
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd && event.urlAfterRedirects.split(/[?#]/)[0] === '/home/device'),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => void this.refresh());
    this.data.authDataChanged.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.refresh());
  }
  async refresh(): Promise<void> {
    this.error = '';
    if (!this.data.auth?.accessToken) return;
    const epoch = this.data.sessionEpoch;
    try { await this.imports.load(); }
    catch { if (epoch === this.data.sessionEpoch) this.error = '旧设备资料读取失败'; }
  }
}
