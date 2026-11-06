import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { BehaviorSubject, Subject } from 'rxjs';

export interface AppVisibilityTransition {
  readonly reason: 'pause' | 'stop' | 'resume' | 'snapshot';
  readonly sequence: number;
}

@Injectable({ providedIn: 'root' })
export class AppVisibilityService implements OnDestroy {
  readonly active = new BehaviorSubject(true);
  private readonly lifecycleChanges = new Subject<AppVisibilityTransition>();
  readonly transitions = this.lifecycleChanges.asObservable();

  private destroyed = false;
  private readonly listeners: PluginListenerHandle[] = [];
  private lifecycleObserved = false;
  private sequence = 0;

  constructor(private readonly zone: NgZone) {
    void this.initialize();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    for (const listener of this.listeners.splice(0)) void listener.remove();
    this.active.complete();
    this.lifecycleChanges.complete();
  }

  private async initialize(): Promise<void> {
    const changed = (reason: AppVisibilityTransition['reason'], active: boolean) => {
      if (this.destroyed) return;
      this.lifecycleObserved = true;
      // Preserve pause -> stop even when active is already false. This is an
      // observation port, not permission to run work while backgrounded.
      this.zone.run(() => this.lifecycleChanges.next({ reason, sequence: ++this.sequence }));
      this.setActive(active);
    };
    const retain = async (register: () => Promise<PluginListenerHandle>) => {
      try {
        const listener = await register();
        if (this.destroyed) await listener.remove();
        else this.listeners.push(listener);
      } catch {
        // Browser/test runtimes may not expose native lifecycle listeners.
      }
    };
    await Promise.all([
      retain(() => App.addListener('appStateChange', state => changed(state.isActive ? 'resume' : 'stop', state.isActive))),
      // Android appStateChange(false) is emitted at onStop. Relinquish UI
      // resources at onPause, before the WebView may suspend its JS runtime.
      retain(() => App.addListener('pause', () => changed('pause', false))),
    ]);
    if (this.destroyed) return;
    try {
      const state = await App.getState();
      // A late snapshot cannot undo a more recent native pause/resume event.
      if (!this.lifecycleObserved) changed('snapshot', state.isActive);
    } catch {
      // Default to active when the host cannot report lifecycle state.
    }
  }

  private setActive(active: boolean): void {
    if (this.destroyed || this.active.value === active) return;
    this.zone.run(() => this.active.next(active));
  }
}
