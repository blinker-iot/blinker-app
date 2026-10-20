import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';

export interface NetworkEvidence { connected: boolean | undefined; wifi: boolean; generation: number; }

@Injectable({ providedIn: 'root' })
export class NetworkService {
  // Native link evidence only, never MQTT retrying or navigator.onLine.
  private readonly connection = new BehaviorSubject<boolean | undefined>(undefined);
  readonly connected = this.connection.asObservable();
  private readonly evidence = new BehaviorSubject<NetworkEvidence>({ connected: undefined, wifi: false, generation: 0 });
  readonly changes = this.evidence.asObservable();
  get current(): NetworkEvidence { return this.evidence.value; }
  private started = false;
  get offline(): boolean { return this.connection.value === false; }

  init(): void {
    if (this.started || !Capacitor.isNativePlatform()) return;
    this.started = true;
    void this.observe();
  }

  private async observe(): Promise<void> {
    let listener: Awaited<ReturnType<typeof Network.addListener>> | undefined;
    let version = 0;
    let live = true;
    const update = (state?: { connected?: unknown; connectionType?: unknown }) => {
      const connected = typeof state?.connected === 'boolean' ? state.connected : undefined;
      this.evidence.next({ connected, wifi: connected === true && state?.connectionType === 'wifi',
        generation: this.evidence.value.generation + 1 });
      this.connection.next(connected);
    };
    try {
      listener = await Network.addListener('networkStatusChange', state => {
        if (live) { ++version; update(state); }
      });
      const current = version;
      const state = await Network.getStatus();
      if (current === version) update(state); // Late query cannot overwrite a newer event.
    } catch {
      live = false;
      update(undefined);
      await listener?.remove().catch(() => undefined);
    }
  }
}
