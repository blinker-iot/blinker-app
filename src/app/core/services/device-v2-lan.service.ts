import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { merge, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API } from '../../configs/api.config';
import { captureDeviceV2AccountContext, assertDeviceV2AccountContext, DeviceV2AccountContext } from '../device-v2/account-scope';
import { LocalAccessConnection, LocalAccessConnector } from '../device-v2/local-access/connector';
import { HttpLocalAccessApi } from '../device-v2/local-access/api';
import { LocalAccessClient } from '../device-v2/local-access/client';
import { LocalLanDiscovery } from '../device-v2/local-access/discovery';
import { LocalLanDirectory } from '../device-v2/local-access/directory';
import { NativeLocalAccessLink } from '../device-v2/local-access/native-link';
import { openLocalDeviceSession } from '../device-v2/local-access/session';
import { DataService } from './data.service';
import { NetworkService } from './network.service';
import { AppVisibilityService } from './app-visibility.service';

interface DiscoveryScope {
  account: DeviceV2AccountContext;
  generation: number;
  directory: LocalLanDirectory;
  warm: AbortController;
  warmTimer?: ReturnType<typeof setTimeout>;
}

// Small platform composition. Page demand/routes stay in DeviceUiPort; the
// connector knows neither Angular nor MQTT. Discovery hints stay in memory;
// only this composition owns their account/network/foreground lifetime.
@Injectable({ providedIn: 'root' })
export class DeviceV2LanService implements OnDestroy {
  private readonly connector: LocalAccessConnector;
  // One public caller ID per authenticated App lifetime, not per page/socket.
  // Reopening can reuse the finite server authorization; no key or IP cache.
  private caller?: { account: DeviceV2AccountContext; id: Uint8Array };
  private readonly discovery = new LocalLanDiscovery();
  private scope?: DiscoveryScope;
  private retirement: Promise<void> = Promise.resolve();
  private readonly lifecycle: Subscription;
  private readonly destruction = new AbortController();
  private destroyed = false;
  constructor(http: HttpClient, private readonly data: DataService, private readonly network: NetworkService,
    private readonly visibility: AppVisibilityService) {
    const api = new HttpLocalAccessApi(http, () => captureDeviceV2AccountContext(data, API.BASE_URL));
    this.connector = new LocalAccessConnector({
      context: (id, signal) => api.getContext(id, signal),
      scan: (signal, found) => {
        if (!this.scope) throw new Error('LOCAL_DISCOVERY_SCOPE_CLOSED');
        return this.scope.directory.scan(signal, found);
      },
      link: (candidate, signal) => NativeLocalAccessLink.open(candidate.host, candidate.port, signal),
      session: (link, request, signal) => openLocalDeviceSession(new LocalAccessClient(link, api), request, signal),
      randomId: () => crypto.getRandomValues(new Uint8Array(16)),
    });
    this.lifecycle = merge(data.authDataChanged, network.changes, visibility.active)
      .subscribe(() => this.refreshDiscovery());
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.destruction.abort();
    this.lifecycle.unsubscribe();
    this.refreshDiscovery();
  }

  private supported(): boolean {
    return !this.destroyed && this.visibility.active.value && environment.deviceV2LanEnabled
      && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('BlinkerLocalWebSocket')
      && API.BASE_URL.startsWith('https:') && !!this.data.auth?.uuid && this.network.current.wifi;
  }

  private refreshDiscovery(): void {
    let account: DeviceV2AccountContext | undefined;
    if (this.supported()) {
      try { account = captureDeviceV2AccountContext(this.data, API.BASE_URL); } catch { /* No trusted scope yet. */ }
    }
    const old = this.scope, generation = this.network.current.generation;
    if (account && old && old.account.accountId === account.accountId && old.account.authority === account.authority
      && old.account.sessionEpoch === account.sessionEpoch && old.generation === generation) return;
    this.scope = undefined;
    if (old) {
      clearTimeout(old.warmTimer);
      old.warm.abort();
      // Rapid pause/network/account changes cannot skip an older unwatch.
      this.retirement = Promise.all([this.retirement, old.directory.close()]).then(() => undefined);
      void this.retirement.catch(() => undefined);
    }
    if (!account) return;
    const previous = this.retirement;
    const directory = new LocalLanDirectory(async (signal, changed) => {
      await previous;
      if (signal.aborted) return;
      await this.discovery.browse(signal, changed);
    });
    const warm = new AbortController();
    const scope: DiscoveryScope = { account, generation, directory, warm };
    this.scope = scope;
    // One bounded ten-second warm round per foreground generation, not a
    // background polling loop, per-device socket or advance Grant request.
    // Native resume commonly precedes its network snapshot. Coalesce only
    // speculative work; invalidation and explicit page demand remain immediate.
    scope.warmTimer = setTimeout(() => {
      scope.warmTimer = undefined;
      if (this.scope === scope && this.supported())
        void directory.scan(warm.signal, () => undefined).catch(() => undefined);
    }, 250);
  }

  available(id: string): boolean {
    const device = this.data.getDevice(id);
    return this.supported() && device?.cloudEnabled === true
      && device.deviceType !== 'ble' && device.deviceType !== 'edge-hub' && device.config?.disabled !== true;
  }

  async open(id: string, signal: AbortSignal): Promise<LocalAccessConnection> {
    if (!this.available(id)) throw new Error('LOCAL_ACCESS_UNAVAILABLE');
    this.refreshDiscovery();
    clearTimeout(this.scope?.warmTimer);
    if (this.scope) this.scope.warmTimer = undefined;
    const account = captureDeviceV2AccountContext(this.data, API.BASE_URL);
    if (!this.caller || this.caller.account.accountId !== account.accountId || this.caller.account.authority !== account.authority
      || this.caller.account.sessionEpoch !== account.sessionEpoch) {
      this.caller = { account, id: crypto.getRandomValues(new Uint8Array(16)) };
    }
    const callerSessionId = this.caller.id.slice();
    const generation = this.network.current.generation;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    this.destruction.signal.addEventListener('abort', abort, { once: true });
    const network = this.network.changes.subscribe(state => { if (state.generation !== generation) abort(); });
    const visibility = this.visibility.active.subscribe(active => { if (!active) abort(); });
    const auth = this.data.authDataChanged.subscribe(() => {
      try { assertDeviceV2AccountContext(this.data, account); } catch { abort(); }
    });
    const detach = () => {
      network.unsubscribe(); auth.unsubscribe(); visibility.unsubscribe(); signal.removeEventListener('abort', abort);
      this.destruction.signal.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', detach);
    };
    controller.signal.addEventListener('abort', detach, { once: true });
    try {
      signal.throwIfAborted();
      const connection = await this.connector.open(id, controller.signal, () => {
        assertDeviceV2AccountContext(this.data, account);
        if (!this.available(id) || generation !== this.network.current.generation) throw new Error('LOCAL_ACCESS_CONTEXT_CHANGED');
      }, callerSessionId);
      controller.signal.throwIfAborted(); assertDeviceV2AccountContext(this.data, account);
      connection.session.subscribeClosed(detach);
      return connection;
    } catch (error) { abort(); detach(); throw error; }
  }
}
