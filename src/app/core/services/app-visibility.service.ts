import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AppVisibilityService implements OnDestroy {
  readonly active = new BehaviorSubject(true);

  private destroyed = false;
  private listener?: PluginListenerHandle;

  constructor(private readonly zone: NgZone) {
    void this.initialize();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    void this.listener?.remove();
    this.active.complete();
  }

  private async initialize(): Promise<void> {
    try {
      const listener = await App.addListener('appStateChange', state => {
        this.setActive(state.isActive);
      });
      if (this.destroyed) await listener.remove();
      else this.listener = listener;
    } catch {
      // Browser/test runtimes may not expose the native listener.
    }
    try {
      const state = await App.getState();
      this.setActive(state.isActive);
    } catch {
      // Default to active when the host cannot report lifecycle state.
    }
  }

  private setActive(active: boolean): void {
    if (this.destroyed || this.active.value === active) return;
    this.zone.run(() => this.active.next(active));
  }
}
