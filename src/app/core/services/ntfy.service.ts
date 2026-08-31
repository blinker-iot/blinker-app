import {
  HttpClient,
  HttpErrorResponse,
  type HttpResponse,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Ntfy, type NtfyMessage, type NtfyStartOptions } from 'capacitor-ntfy';
import { Subject, Subscription, firstValueFrom } from 'rxjs';

import { API } from '../../configs/api.config';
import { NTFY_CONFIG } from '../../configs/ntfy.config';
import { GatewayHttpError } from '../model/response.model';
import { DataService } from './data.service';

type InstallationState =
  | 'provisioning'
  | 'active'
  | 'revoke_pending'
  | 'revoked';

interface NtfyCredentials {
  baseUrl: string;
  username: string;
  topic: string;
  token: string;
}

interface InstallationData {
  installation: {
    id: string;
    installationId: string;
    platform: 'android';
    state: InstallationState;
  };
  ntfy?: NtfyCredentials;
}

interface InstallationEnvelope {
  status: number;
  data: InstallationData;
}

interface StoredInstallation {
  ownerAccountId: string;
  installationId: string;
  idempotencyKey: string;
  serverInstallationId?: string;
  state: InstallationState;
  ntfy?: NtfyCredentials;
}

interface LegacyStoredInstallation extends StoredInstallation {
  version: 1;
}

interface PendingCleanup {
  ownerAccountId: string;
  installationId: string;
  idempotencyKey: string;
  serverInstallationId?: string;
}

interface StoredInstallationState {
  version: 2;
  current: StoredInstallation | null;
  pendingCleanup: PendingCleanup[];
}

interface ErrorInfo {
  status: number;
  code: string;
  retryAfterMs: number | null;
}

@Injectable({ providedIn: 'root' })
export class NtfyService {
  private initialized = false;
  private storageReady: Promise<void> | null = null;
  private storageLoaded = false;
  private storedInstallation: StoredInstallation | null = null;
  private pendingCleanup: PendingCleanup[] = [];
  private storageMutation: Promise<void> = Promise.resolve();
  private provisionInFlight: Promise<boolean> | null = null;
  private provisionAccountId: string | null = null;
  private provisionSessionEpoch: number | null = null;
  private revokeInFlight: Promise<boolean> | null = null;
  private sessionCleanupInFlight: Promise<void> | null = null;
  private listeners: PluginListenerHandle[] = [];
  private subscriptions: Subscription[] = [];
  private observedSessionEpoch: number;
  private userDataReadyEpoch: number | null;
  private userDataResetEpoch: number | null;
  private readonly seenMessageIds = new Set<string>();
  private readonly messageIdSubject = new Subject<string>();

  readonly messageIds$ = this.messageIdSubject.asObservable();

  constructor(
    private readonly http: HttpClient,
    private readonly dataService: DataService,
  ) {
    this.observedSessionEpoch = dataService.sessionEpoch;
    this.userDataReadyEpoch = null;
    this.userDataResetEpoch = dataService.userDataLoader.value
      ? null
      : dataService.sessionEpoch;
  }

  async init(): Promise<void> {
    if (this.initialized || !this.isAndroid()) return;

    this.initialized = true;
    try {
      await this.loadStoredInstallation();
      this.listeners.push(
        await Ntfy.addListener('messageReceived', (message) => {
          this.handleMessage(message);
        }),
      );
      this.subscriptions.push(
        this.dataService.authDataChanged.subscribe(() => {
          this.handleAuthDataChanged();
        }),
        this.dataService.userDataLoader.subscribe((loaded) => {
          this.handleUserDataStateChanged(loaded);
        }),
      );

      if (this.currentAccountId()) {
        await this.ensureInstallation();
      } else {
        await this.stopSubscription(true);
      }
    } catch {
      this.initialized = false;
      this.subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
      await this.removeListeners();
    }
  }

  ensureInstallation(): Promise<boolean> {
    if (!this.isAndroid() || !this.dataService.auth?.accessToken) {
      return Promise.resolve(false);
    }
    if (this.revokeInFlight) {
      return this.revokeInFlight.then(() => this.ensureInstallation());
    }
    if (this.sessionCleanupInFlight) {
      return this.sessionCleanupInFlight.then(() => this.ensureInstallation());
    }
    const accountId = this.currentAccountId();
    if (!accountId) return Promise.resolve(false);
    const sessionEpoch = this.dataService.sessionEpoch;
    if (this.provisionInFlight) {
      if (
        this.provisionAccountId === accountId
        && this.provisionSessionEpoch === sessionEpoch
      ) {
        return this.provisionInFlight;
      }
      return this.provisionInFlight.then(() => this.ensureInstallation());
    }

    const task = this.provision(accountId, sessionEpoch).catch(() => false);
    const tracked = task.finally(() => {
      if (this.provisionInFlight === tracked) {
        this.provisionInFlight = null;
        this.provisionAccountId = null;
        this.provisionSessionEpoch = null;
      }
    });
    this.provisionAccountId = accountId;
    this.provisionSessionEpoch = sessionEpoch;
    this.provisionInFlight = tracked;
    return tracked;
  }

  revoke(): Promise<boolean> {
    if (!this.isAndroid()) return Promise.resolve(true);
    if (this.revokeInFlight) return this.revokeInFlight;

    const pendingProvision = this.provisionInFlight;
    const task = (pendingProvision
      ? pendingProvision.then(() => undefined)
      : Promise.resolve()
    ).then(async () => {
      const revoked = await this.revokeCurrentInstallation().catch(() => false);
      if (!revoked) await this.preserveCurrentInstallationForCleanup();
      return revoked;
    }).catch(() => false);
    const tracked = task.finally(() => {
      if (this.revokeInFlight === tracked) this.revokeInFlight = null;
    });
    this.revokeInFlight = tracked;
    return tracked;
  }

  private async provision(accountId: string, sessionEpoch: number): Promise<boolean> {
    if (!await this.cleanupPendingForAccount(accountId, sessionEpoch)) return false;
    if (!this.isCurrentSession(accountId, sessionEpoch)) return false;
    let record = await this.recordForAccount(accountId, sessionEpoch);
    if (!record) return false;

    let cachedSubscriptionStarted = false;
    if (record.state === 'active' && record.ntfy) {
      cachedSubscriptionStarted = await this.startSubscription(
        record.ntfy,
        accountId,
        sessionEpoch,
      );
      if (!this.isCurrentSession(accountId, sessionEpoch)) {
        await this.preserveForCleanup(record);
        return false;
      }
    }

    for (
      let rotation = 0;
      rotation <= NTFY_CONFIG.maxConflictRotations;
      rotation += 1
    ) {
      let rotate = false;
      for (
        let attempt = 0;
        attempt <= NTFY_CONFIG.provisionRetryDelaysMs.length;
        attempt += 1
      ) {
        if (!this.isCurrentSession(accountId, sessionEpoch)) {
          await this.preserveForCleanup(record);
          return false;
        }
        try {
          const response = await this.postInstallation(record);
          record.serverInstallationId = response.installation.id;
          record.state = response.installation.state;
          if (!this.isCurrentSession(accountId, sessionEpoch)) {
            await this.preserveForCleanup(record);
            return false;
          }

          if (record.state === 'active' && response.ntfy) {
            record.ntfy = response.ntfy;
            await this.persist(record);
            if (!this.isCurrentSession(accountId, sessionEpoch)) {
              await this.preserveForCleanup(record);
              return false;
            }
            const started = await this.startSubscription(
              response.ntfy,
              accountId,
              sessionEpoch,
            );
            if (!this.isCurrentSession(accountId, sessionEpoch)) {
              await this.preserveForCleanup(record);
              return false;
            }
            return started;
          }

          delete record.ntfy;
          await this.persist(record);
          if (!this.isCurrentSession(accountId, sessionEpoch)) {
            await this.preserveForCleanup(record);
            return false;
          }
          await this.stopSubscription(false);
          cachedSubscriptionStarted = false;
          if (attempt >= NTFY_CONFIG.provisionRetryDelaysMs.length) {
            return false;
          }
          await this.delay(NTFY_CONFIG.provisionRetryDelaysMs[attempt]);
        } catch (error) {
          if (!this.isCurrentSession(accountId, sessionEpoch)) {
            await this.preserveForCleanup(record);
            return false;
          }
          const info = this.errorInfo(error);
          if (this.isConflict(info)) {
            rotate = true;
            break;
          }
          if (
            !this.isRetriable(info)
            || attempt >= NTFY_CONFIG.provisionRetryDelaysMs.length
          ) {
            return cachedSubscriptionStarted;
          }
          await this.delay(this.retryDelay(
            info,
            NTFY_CONFIG.provisionRetryDelaysMs[attempt],
          ));
        }
      }

      if (!rotate || rotation >= NTFY_CONFIG.maxConflictRotations) return false;
      if (!this.isCurrentSession(accountId, sessionEpoch)) {
        await this.preserveForCleanup(record);
        return false;
      }
      await this.stopSubscription(true);
      record = this.newRecord(accountId);
      await this.persist(record);
      if (!this.isCurrentSession(accountId, sessionEpoch)) {
        await this.preserveForCleanup(record);
        return false;
      }
      cachedSubscriptionStarted = false;
    }
    return false;
  }

  private async postInstallation(
    record: Pick<StoredInstallation, 'installationId' | 'idempotencyKey'>,
  ): Promise<InstallationData> {
    const response = await firstValueFrom(this.http.post<InstallationEnvelope>(
      API.NOTIFICATION_INSTALLATIONS.COLLECTION,
      { installationId: record.installationId, platform: 'android' },
      {
        headers: { 'Idempotency-Key': record.idempotencyKey },
        observe: 'response',
      },
    ));
    this.requireNoStore(response);
    return this.installationData(response, record.installationId);
  }

  private async revokeCurrentInstallation(): Promise<boolean> {
    await this.loadStoredInstallation();
    await this.stopSubscription(true);
    let record = this.storedInstallation;
    if (!record) return true;

    if (!this.dataService.auth?.accessToken) return false;

    const accountId = this.currentAccountId();
    const sessionEpoch = this.dataService.sessionEpoch;
    if (!accountId || accountId !== record.ownerAccountId) return false;

    if (!record.serverInstallationId) {
      for (
        let attempt = 0;
        attempt <= NTFY_CONFIG.provisionRetryDelaysMs.length;
        attempt += 1
      ) {
        if (!this.isCurrentSession(accountId, sessionEpoch)) return false;
        try {
          const response = await this.postInstallation(record);
          record.serverInstallationId = response.installation.id;
          record.state = response.installation.state;
          delete record.ntfy;
          if (!this.isCurrentSession(accountId, sessionEpoch)) return false;
          await this.persist(record);
          break;
        } catch (error) {
          const info = this.errorInfo(error);
          if (
            !this.isRetriable(info)
            || attempt >= NTFY_CONFIG.provisionRetryDelaysMs.length
          ) {
            return false;
          }
          await this.delay(this.retryDelay(
            info,
            NTFY_CONFIG.provisionRetryDelaysMs[attempt],
          ));
        }
      }
      if (!record.serverInstallationId) return false;
    }

    record.state = 'revoke_pending';
    delete record.ntfy;
    await this.persist(record);

    for (
      let attempt = 0;
      attempt <= NTFY_CONFIG.revokeRetryDelaysMs.length;
      attempt += 1
    ) {
      if (!this.isCurrentSession(accountId, sessionEpoch)) return false;
      try {
        const response = await firstValueFrom(this.http.delete<InstallationEnvelope>(
          API.NOTIFICATION_INSTALLATIONS.DETAIL(record.serverInstallationId),
          { observe: 'response' },
        ));
        const data = this.revocationData(response, record.serverInstallationId);
        if (data.installation.state === 'revoked') {
          await this.removeInstallation(record);
          return true;
        }
        if (attempt >= NTFY_CONFIG.revokeRetryDelaysMs.length) return false;
        await this.delay(NTFY_CONFIG.revokeRetryDelaysMs[attempt]);
      } catch (error) {
        const info = this.errorInfo(error);
        if (info.status === 404 || info.code === 'MESSAGE_NOT_FOUND') {
          await this.removeInstallation(record);
          return true;
        }
        if (
          !this.isRetriable(info)
          || attempt >= NTFY_CONFIG.revokeRetryDelaysMs.length
        ) {
          return false;
        }
        await this.delay(this.retryDelay(
          info,
          NTFY_CONFIG.revokeRetryDelaysMs[attempt],
        ));
      }
    }
    return false;
  }

  private async cleanupPendingForAccount(
    accountId: string,
    sessionEpoch: number,
  ): Promise<boolean> {
    await this.loadStoredInstallation();
    const records = this.pendingCleanup.filter(
      record => record.ownerAccountId === accountId,
    );
    for (const record of records) {
      if (!this.isCurrentSession(accountId, sessionEpoch)) return false;
      if (!await this.cleanupPendingRecord(record, accountId, sessionEpoch)) return false;
    }
    return true;
  }

  private async cleanupPendingRecord(
    initialRecord: PendingCleanup,
    accountId: string,
    sessionEpoch: number,
  ): Promise<boolean> {
    let record = initialRecord;
    if (!record.serverInstallationId) {
      for (
        let attempt = 0;
        attempt <= NTFY_CONFIG.provisionRetryDelaysMs.length;
        attempt += 1
      ) {
        if (!this.isCurrentSession(accountId, sessionEpoch)) return false;
        try {
          const response = await this.postInstallation(record);
          record = {
            ...record,
            serverInstallationId: response.installation.id,
          };
          await this.storePendingCleanup(record);
          break;
        } catch (error) {
          if (!this.isCurrentSession(accountId, sessionEpoch)) return false;
          const info = this.errorInfo(error);
          if (
            info.status === 409
            && info.code === 'NOTIFICATION_INSTALLATION_REVOKED'
          ) {
            await this.removePendingCleanup(record);
            return true;
          }
          if (
            !this.isRetriable(info)
            || attempt >= NTFY_CONFIG.provisionRetryDelaysMs.length
          ) {
            return false;
          }
          await this.delay(this.retryDelay(
            info,
            NTFY_CONFIG.provisionRetryDelaysMs[attempt],
          ));
        }
      }
    }

    const serverInstallationId = record.serverInstallationId;
    if (!serverInstallationId) return false;
    for (
      let attempt = 0;
      attempt <= NTFY_CONFIG.revokeRetryDelaysMs.length;
      attempt += 1
    ) {
      if (!this.isCurrentSession(accountId, sessionEpoch)) return false;
      try {
        const response = await firstValueFrom(this.http.delete<InstallationEnvelope>(
          API.NOTIFICATION_INSTALLATIONS.DETAIL(serverInstallationId),
          { observe: 'response' },
        ));
        const data = this.revocationData(response, serverInstallationId);
        if (data.installation.state === 'revoked') {
          await this.removePendingCleanup(record);
          return true;
        }
        if (!this.isCurrentSession(accountId, sessionEpoch)) return false;
        if (attempt >= NTFY_CONFIG.revokeRetryDelaysMs.length) return false;
        await this.delay(NTFY_CONFIG.revokeRetryDelaysMs[attempt]);
      } catch (error) {
        const info = this.errorInfo(error);
        if (info.status === 404 || info.code === 'MESSAGE_NOT_FOUND') {
          await this.removePendingCleanup(record);
          return true;
        }
        if (!this.isCurrentSession(accountId, sessionEpoch)) return false;
        if (
          !this.isRetriable(info)
          || attempt >= NTFY_CONFIG.revokeRetryDelaysMs.length
        ) {
          return false;
        }
        await this.delay(this.retryDelay(
          info,
          NTFY_CONFIG.revokeRetryDelaysMs[attempt],
        ));
      }
    }
    return false;
  }

  private async preserveCurrentInstallationForCleanup(): Promise<void> {
    await this.loadStoredInstallation();
    const record = this.storedInstallation;
    if (record) await this.preserveForCleanup(record);
  }

  private async recordForAccount(
    accountId: string,
    sessionEpoch: number,
  ): Promise<StoredInstallation | null> {
    await this.loadStoredInstallation();
    if (!this.isCurrentSession(accountId, sessionEpoch)) return null;
    if (this.storedInstallation) {
      if (this.storedInstallation.ownerAccountId === accountId) {
        return this.storedInstallation;
      }
      const previousRecord = this.storedInstallation;
      await this.stopSubscription(true);
      if (!this.isCurrentSession(accountId, sessionEpoch)) return null;
      await this.preserveForCleanup(previousRecord, false);
      if (!this.isCurrentSession(accountId, sessionEpoch)) return null;
    }

    const record = this.newRecord(accountId);
    await this.persist(record);
    if (!this.isCurrentSession(accountId, sessionEpoch)) {
      await this.preserveForCleanup(record);
      return null;
    }
    return record;
  }

  private newRecord(ownerAccountId: string): StoredInstallation {
    return {
      ownerAccountId,
      installationId: this.randomValue('ntfy-installation-'),
      idempotencyKey: this.randomValue('ntfy-operation-'),
      state: 'provisioning',
    };
  }

  private async startSubscription(
    credentials: NtfyCredentials,
    accountId: string,
    sessionEpoch: number,
  ): Promise<boolean> {
    try {
      if (!this.isCurrentSession(accountId, sessionEpoch)) return false;
      try {
        await Ntfy.requestNotificationPermission();
      } catch {
        // A denied notification permission must not expose or replace credentials.
      }
      if (!this.isCurrentSession(accountId, sessionEpoch)) return false;
      const options: NtfyStartOptions = {
        baseUrl: credentials.baseUrl,
        topics: [credentials.topic],
        username: credentials.username,
        token: credentials.token,
        initialSince: NTFY_CONFIG.initialSince,
        autoStartOnBoot: NTFY_CONFIG.autoStartOnBoot,
        showNotifications: NTFY_CONFIG.showNotifications,
        historyLimit: NTFY_CONFIG.historyLimit,
        foregroundTitle: NTFY_CONFIG.foregroundTitle,
        foregroundText: NTFY_CONFIG.foregroundText,
        serviceChannelId: NTFY_CONFIG.serviceChannelId,
        serviceChannelName: NTFY_CONFIG.serviceChannelName,
        messageChannelId: NTFY_CONFIG.messageChannelId,
        messageChannelName: NTFY_CONFIG.messageChannelName,
      };
      await Ntfy.start(options);
      if (!this.isCurrentSession(accountId, sessionEpoch)) {
        await this.stopSubscription(true);
        return false;
      }
      try {
        const history = await Ntfy.getMessages({ limit: NTFY_CONFIG.historyLimit });
        if (!this.isCurrentSession(accountId, sessionEpoch)) {
          await this.stopSubscription(true);
          return false;
        }
        history.messages.slice().reverse().forEach((message) => this.handleMessage(message));
      } catch {
        // Live delivery remains usable when optional history loading fails.
      }
      return true;
    } catch {
      return false;
    }
  }

  private async stopSubscription(clearMessages: boolean): Promise<void> {
    try {
      await Ntfy.stop();
    } catch {
      // Stopping is best effort; remote revocation is the security boundary.
    }
    if (clearMessages) {
      try {
        await Ntfy.clearMessages();
      } catch {
        // Stored notification history is also cleared on the next successful stop.
      }
      this.seenMessageIds.clear();
    }
  }

  private handleMessage(message: NtfyMessage): void {
    const value = message?.raw?.['sequence_id'];
    if (typeof value !== 'string') return;
    const messageId = value.trim();
    if (!messageId || messageId.length > 128 || this.seenMessageIds.has(messageId)) {
      return;
    }

    this.seenMessageIds.add(messageId);
    if (this.seenMessageIds.size > 256) {
      const oldest = this.seenMessageIds.values().next().value;
      if (typeof oldest === 'string') this.seenMessageIds.delete(oldest);
    }
    this.messageIdSubject.next(messageId);
  }

  private handleAuthStateChanged(): void {
    if (!this.dataService.auth?.accessToken) {
      if (!this.sessionCleanupInFlight) void this.stopSubscription(true);
      return;
    }
    if (this.currentAccountId()) void this.ensureInstallation();
  }

  private handleAuthDataChanged(): void {
    const sessionEpoch = this.dataService.sessionEpoch;
    if (sessionEpoch !== this.observedSessionEpoch) {
      this.observedSessionEpoch = sessionEpoch;
      this.userDataReadyEpoch = null;
      this.userDataResetEpoch = null;
      const previousCleanup = this.sessionCleanupInFlight;
      const cleanup = (previousCleanup ?? Promise.resolve())
        .then(async () => {
          await this.stopSubscription(true);
          await this.loadStoredInstallation();
          const record = this.storedInstallation;
          if (record) await this.preserveForCleanup(record, false);
        })
        .finally(() => {
          if (this.sessionCleanupInFlight === cleanup) {
            this.sessionCleanupInFlight = null;
          }
        });
      this.sessionCleanupInFlight = cleanup;
      void cleanup.then(() => {
        if (this.dataService.auth?.accessToken) this.handleAuthStateChanged();
      });
      return;
    }
    this.handleAuthStateChanged();
  }

  private handleUserDataStateChanged(loaded: boolean): void {
    const sessionEpoch = this.dataService.sessionEpoch;
    if (!loaded) {
      this.userDataReadyEpoch = null;
      this.userDataResetEpoch = sessionEpoch;
    } else if (this.userDataResetEpoch === sessionEpoch) {
      this.userDataReadyEpoch = sessionEpoch;
    }
    this.handleAuthStateChanged();
  }

  private currentAccountId(): string | null {
    if (!this.dataService.auth?.accessToken) return null;
    const authId = this.text(this.dataService.auth.uuid, 128);
    if (authId) return authId;
    if (this.userDataReadyEpoch !== this.dataService.sessionEpoch) return null;
    return this.text(this.dataService.user?.id, 128);
  }

  private isCurrentSession(accountId: string, sessionEpoch: number): boolean {
    return this.dataService.sessionEpoch === sessionEpoch
      && this.currentAccountId() === accountId;
  }

  private async preserveForCleanup(
    record: StoredInstallation,
    stopSubscription = true,
  ): Promise<void> {
    if (stopSubscription) await this.stopSubscription(true);
    await this.loadStoredInstallation();
    const pending = this.toPendingCleanup(record);
    await this.mutateStorage(async () => {
      this.upsertPendingCleanup(pending);
      if (this.sameInstallation(this.storedInstallation, record)) {
        this.storedInstallation = null;
      }
      await this.writeStorage();
    });
  }

  private installationData(
    response: HttpResponse<InstallationEnvelope>,
    expectedInstallationId: string,
  ): InstallationData {
    const body = response.body;
    const data = body?.data;
    const installation = data?.installation;
    if (
      body?.status !== response.status
      || !installation
      || installation.installationId !== expectedInstallationId
      || installation.platform !== 'android'
      || !this.text(installation.id, 128)
    ) {
      throw new Error('Notification installation response is invalid.');
    }
    if (response.status === 202 && installation.state === 'provisioning' && !data.ntfy) {
      return data;
    }
    if (
      (response.status === 200 || response.status === 201)
      && installation.state === 'active'
      && this.validCredentials(data.ntfy)
    ) {
      return data;
    }
    throw new Error('Notification installation state is invalid.');
  }

  private revocationData(
    response: HttpResponse<InstallationEnvelope>,
    expectedServerId: string,
  ): InstallationData {
    const body = response.body;
    const data = body?.data;
    const installation = data?.installation;
    const validState = response.status === 200
      ? installation?.state === 'revoked'
      : response.status === 202 && installation?.state === 'revoke_pending';
    if (
      !data
      || !installation
      || body?.status !== response.status
      || installation.id !== expectedServerId
      || installation.platform !== 'android'
      || !validState
      || data.ntfy
    ) {
      throw new Error('Notification revocation response is invalid.');
    }
    return data;
  }

  private requireNoStore(response: HttpResponse<unknown>): void {
    const values = response.headers.get('Cache-Control')?.toLowerCase().split(',') || [];
    if (!values.some((value) => value.trim() === 'no-store')) {
      throw new Error('Notification credentials response is cacheable.');
    }
  }

  private validCredentials(value: NtfyCredentials | undefined): value is NtfyCredentials {
    if (!value) return false;
    try {
      const url = new URL(value.baseUrl);
      if (
        url.protocol !== 'https:'
        || !!url.username
        || !!url.password
        || !!url.search
        || !!url.hash
      ) {
        return false;
      }
    } catch {
      return false;
    }
    return !!(
      this.text(value.username, 256)
      && this.text(value.topic, 256)
      && this.text(value.token, 2_048)
    );
  }

  private errorInfo(error: unknown): ErrorInfo {
    if (error instanceof GatewayHttpError) {
      return {
        status: error.httpStatus,
        code: error.code,
        retryAfterMs: Number.isFinite(error.retryAfterSeconds)
          ? Math.max(0, Number(error.retryAfterSeconds) * 1_000)
          : null,
      };
    }
    if (error instanceof HttpErrorResponse) {
      const body = this.record(error.error);
      const code = body?.['errorCode'] ?? body?.['code'];
      const retryAfter = Number(error.headers?.get('Retry-After'));
      return {
        status: error.status,
        code: code === undefined || code === null ? `HTTP_${error.status}` : String(code),
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter >= 0
          ? retryAfter * 1_000
          : null,
      };
    }
    return { status: -1, code: 'CLIENT_CONTRACT_ERROR', retryAfterMs: null };
  }

  private isConflict(info: ErrorInfo): boolean {
    return info.status === 409 && (
      info.code === 'NOTIFICATION_IDEMPOTENCY_CONFLICT'
      || info.code === 'NOTIFICATION_INSTALLATION_REVOKED'
    );
  }

  private isRetriable(info: ErrorInfo): boolean {
    return info.status === 0
      || info.status === 429
      || info.status >= 500
      || [
        'MESSAGE_INTERNAL_ERROR',
        'AILY_UNAVAILABLE',
        'AILY_TIMEOUT',
        'AILY_INVALID_RESPONSE',
        'GATEWAY_TIMEOUT',
        'NETWORK_ERROR',
      ].includes(info.code);
  }

  private retryDelay(info: ErrorInfo, fallback: number): number {
    return Math.min(
      info.retryAfterMs ?? fallback,
      NTFY_CONFIG.maxRetryDelayMs,
    );
  }

  private async loadStoredInstallation(): Promise<void> {
    if (this.storageLoaded) return;
    await this.mutateStorage(async () => {
      if (this.storageLoaded) return;
      await this.configureSecureStorage();
      const value = await SecureStorage.get(NTFY_CONFIG.secureStorageKey);
      if (this.validStoredInstallationState(value)) {
        this.storedInstallation = value.current;
        this.pendingCleanup = [];
        value.pendingCleanup.forEach(
          record => this.upsertPendingCleanup(this.copyPendingCleanup(record)),
        );
        await SecureStorage.remove(NTFY_CONFIG.legacySecureStorageKey);
        this.storageLoaded = true;
        return;
      }

      let legacy = this.validLegacyStoredInstallation(value) ? value : null;
      let legacyKey: string = NTFY_CONFIG.secureStorageKey;
      if (!legacy) {
        if (value !== null) await SecureStorage.remove(NTFY_CONFIG.secureStorageKey);
        const legacyValue = await SecureStorage.get(NTFY_CONFIG.legacySecureStorageKey);
        if (this.validLegacyStoredInstallation(legacyValue)) {
          legacy = legacyValue;
          legacyKey = NTFY_CONFIG.legacySecureStorageKey;
        } else if (legacyValue !== null) {
          await SecureStorage.remove(NTFY_CONFIG.legacySecureStorageKey);
        }
      }

      this.storedInstallation = legacy ? this.fromLegacyInstallation(legacy) : null;
      this.pendingCleanup = [];
      this.storageLoaded = true;
      if (legacy) {
        await this.writeStorage();
        if (legacyKey !== NTFY_CONFIG.secureStorageKey) {
          await SecureStorage.remove(legacyKey);
        }
      }
    });
  }

  private async persist(record: StoredInstallation): Promise<void> {
    await this.loadStoredInstallation();
    await this.mutateStorage(async () => {
      this.storedInstallation = record;
      await this.writeStorage();
    });
  }

  private async storePendingCleanup(record: PendingCleanup): Promise<void> {
    await this.loadStoredInstallation();
    await this.mutateStorage(async () => {
      this.upsertPendingCleanup(record);
      await this.writeStorage();
    });
  }

  private async removePendingCleanup(record: PendingCleanup): Promise<void> {
    await this.loadStoredInstallation();
    await this.mutateStorage(async () => {
      this.pendingCleanup = this.pendingCleanup.filter(
        value => !this.sameInstallation(value, record),
      );
      await this.writeStorage();
    });
  }

  private async removeInstallation(record: StoredInstallation): Promise<void> {
    await this.loadStoredInstallation();
    await this.mutateStorage(async () => {
      if (this.sameInstallation(this.storedInstallation, record)) {
        this.storedInstallation = null;
      }
      this.pendingCleanup = this.pendingCleanup.filter(
        value => !this.sameInstallation(value, record),
      );
      await this.writeStorage();
    });
  }

  private async writeStorage(): Promise<void> {
    await this.configureSecureStorage();
    if (!this.storedInstallation && this.pendingCleanup.length === 0) {
      await SecureStorage.remove(NTFY_CONFIG.secureStorageKey);
      return;
    }
    const value: StoredInstallationState = {
      version: 2,
      current: this.storedInstallation,
      pendingCleanup: this.pendingCleanup,
    };
    await SecureStorage.set(
      NTFY_CONFIG.secureStorageKey,
      value as unknown as Record<string, unknown>,
    );
  }

  private mutateStorage<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.storageMutation.then(operation, operation);
    this.storageMutation = task.then(() => undefined, () => undefined);
    return task;
  }

  private configureSecureStorage(): Promise<void> {
    if (!this.storageReady) {
      this.storageReady = SecureStorage.setKeyPrefix(NTFY_CONFIG.secureStoragePrefix);
    }
    return this.storageReady;
  }

  private validStoredInstallation(value: unknown): value is StoredInstallation {
    const stored = this.record(value);
    if (!stored) return false;
    const state = stored['state'];
    const validState = state === 'provisioning'
      || state === 'active'
      || state === 'revoke_pending'
      || state === 'revoked';
    const ntfy = stored['ntfy'];
    return !!(
      validState
      && this.text(stored['ownerAccountId'], 128)
      && this.text(stored['installationId'], 128)
      && this.text(stored['idempotencyKey'], 128)
      && (
        stored['serverInstallationId'] === undefined
        || this.text(stored['serverInstallationId'], 128)
      )
      && (state === 'active' ? this.validCredentials(ntfy as NtfyCredentials) : !ntfy)
    );
  }

  private validLegacyStoredInstallation(
    value: unknown,
  ): value is LegacyStoredInstallation {
    const stored = this.record(value);
    return stored?.['version'] === 1 && this.validStoredInstallation(value);
  }

  private validStoredInstallationState(
    value: unknown,
  ): value is StoredInstallationState {
    const stored = this.record(value);
    return !!(
      stored?.['version'] === 2
      && (stored['current'] === null || this.validStoredInstallation(stored['current']))
      && Array.isArray(stored['pendingCleanup'])
      && stored['pendingCleanup'].every(record => this.validPendingCleanup(record))
    );
  }

  private validPendingCleanup(value: unknown): value is PendingCleanup {
    const stored = this.record(value);
    return !!(
      stored
      && this.text(stored['ownerAccountId'], 128)
      && this.text(stored['installationId'], 128)
      && this.text(stored['idempotencyKey'], 128)
      && (
        stored['serverInstallationId'] === undefined
        || this.text(stored['serverInstallationId'], 128)
      )
    );
  }

  private fromLegacyInstallation(record: LegacyStoredInstallation): StoredInstallation {
    const { version: _version, ...installation } = record;
    return installation;
  }

  private toPendingCleanup(record: StoredInstallation): PendingCleanup {
    return this.copyPendingCleanup(record);
  }

  private copyPendingCleanup(
    record: Pick<PendingCleanup, 'ownerAccountId' | 'installationId'
      | 'idempotencyKey' | 'serverInstallationId'>,
  ): PendingCleanup {
    return {
      ownerAccountId: record.ownerAccountId,
      installationId: record.installationId,
      idempotencyKey: record.idempotencyKey,
      ...(record.serverInstallationId
        ? { serverInstallationId: record.serverInstallationId }
        : {}),
    };
  }

  private upsertPendingCleanup(record: PendingCleanup): void {
    const index = this.pendingCleanup.findIndex(
      value => this.sameInstallation(value, record),
    );
    if (index === -1) {
      this.pendingCleanup.push(record);
      return;
    }
    this.pendingCleanup[index] = {
      ...this.pendingCleanup[index],
      ...record,
      serverInstallationId: record.serverInstallationId
        || this.pendingCleanup[index].serverInstallationId,
    };
  }

  private sameInstallation(
    left: Pick<StoredInstallation, 'ownerAccountId' | 'installationId' | 'idempotencyKey'>
      | null | undefined,
    right: Pick<StoredInstallation, 'ownerAccountId' | 'installationId' | 'idempotencyKey'>,
  ): boolean {
    return left?.ownerAccountId === right.ownerAccountId
      && left.installationId === right.installationId
      && left.idempotencyKey === right.idempotencyKey;
  }

  private randomValue(prefix: string): string {
    const cryptoApi = globalThis.crypto;
    if (typeof cryptoApi?.randomUUID === 'function') {
      return prefix + cryptoApi.randomUUID();
    }
    if (typeof cryptoApi?.getRandomValues !== 'function') {
      throw new Error('Secure randomness is unavailable.');
    }
    const bytes = cryptoApi.getRandomValues(new Uint8Array(24));
    return prefix + Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  private text(value: unknown, maxLength: number): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized && normalized.length <= maxLength && !normalized.includes('\0')
      ? normalized
      : null;
  }

  private record(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private isAndroid(): boolean {
    return NTFY_CONFIG.enabled && Capacitor.getPlatform() === 'android';
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private async removeListeners(): Promise<void> {
    const listeners = this.listeners.splice(0);
    await Promise.all(listeners.map((listener) => listener.remove()));
  }
}
