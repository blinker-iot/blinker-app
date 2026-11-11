import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { Position } from '@capacitor/geolocation';

// Android-only extension of the same Geolocation plugin, not a second provider.
const cancellableLocation = Geolocation as typeof Geolocation & {
  cancelCurrentPosition(options: { requestId: string }): Promise<void>;
};

export interface PhoneLocationFix {
  longitude: number;
  latitude: number;
  source: 'system-network' | 'gnss' | 'unknown';
  coordinateSystem: 'WGS84';
  accuracyMeters: number | null;
  measuredAt: number | null;
}
export type PhoneLocationFailure = 'permission' | 'disabled' | 'timeout' | 'unavailable' | 'aborted' | 'pending';

export class PhoneLocationError extends Error {
  constructor(readonly kind: PhoneLocationFailure) {
    super({ permission: '未获手机定位权限，请在系统设置中允许后重试。',
      disabled: '手机定位服务未开启。', timeout: '本次定位超时，请稍后手动重试。',
      unavailable: '暂时无法获取手机位置。', aborted: '本次定位已取消。',
      pending: '系统定位仍未返回，可先在地图上选点。' }[kind]);
    this.name = 'PhoneLocationError';
  }
}

function failure(error: unknown): PhoneLocationError {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'BLINKER_LOCATION_CANCELLED') return new PhoneLocationError('aborted');
  if (code === 'BLINKER_LOCATION_PENDING') return new PhoneLocationError('pending');
  if (code === 'OS-PLUG-GLOC-0003' || code === 'OS-PLUG-GLOC-0008' || code === 1) return new PhoneLocationError('permission');
  if (code === 'OS-PLUG-GLOC-0007' || code === 'OS-PLUG-GLOC-0009' || code === 'OS-PLUG-GLOC-0017') return new PhoneLocationError('disabled');
  if (code === 'OS-PLUG-GLOC-0010' || code === 3) return new PhoneLocationError('timeout');
  return new PhoneLocationError('unavailable');
}

function fix(position: Position): PhoneLocationFix {
  const metadata = position as Position & { source?: unknown; coordinateSystem?: unknown };
  const longitude = position?.coords?.longitude, latitude = position?.coords?.latitude;
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || (metadata.coordinateSystem !== undefined && metadata.coordinateSystem !== 'WGS84')) {
    throw new PhoneLocationError('unavailable');
  }
  const accuracy = position.coords.accuracy, timestamp = position.timestamp;
  return { longitude, latitude,
    source: metadata.source === 'system-network' || metadata.source === 'gnss' ? metadata.source : 'unknown',
    coordinateSystem: 'WGS84',
    accuracyMeters: typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
    measuredAt: Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : null };
}

@Injectable({ providedIn: 'root' })
export class PhoneLocationService {
  // A JS deadline/abort cannot release the native owner. Only settlement of the
  // original plugin call permits a later explicit attempt, even on page return.
  private nativePending = false;
  // Called only by an explicit user action. The native one-shot call handles its
  // runtime permission prompt; no separate permission request, watch or retry.
  current(signal: AbortSignal): Promise<PhoneLocationFix> {
    if (signal.aborted) return Promise.reject(new PhoneLocationError('aborted'));
    if (this.nativePending) return Promise.reject(new PhoneLocationError('pending'));
    return new Promise((resolve, reject) => {
      let settled = false, requestId: string | undefined, cancellationSent = false;
      const cancelNative = () => {
        if (!requestId || cancellationSent) return;
        cancellationSent = true;
        // A cancel acknowledgement never releases the original native owner.
        void cancellableLocation.cancelCurrentPosition({ requestId }).catch(() => {});
      };
      const expiresAt = Date.now() + 12000;
      const finish = (error?: PhoneLocationError, position?: Position) => {
        if (settled) return;
        // A suspended WebView may receive the native callback before its overdue
        // timer. Never accept that late fix, even though the native owner settled.
        if (signal.aborted) error = new PhoneLocationError('aborted');
        else if (!error && Date.now() >= expiresAt) error = new PhoneLocationError('timeout');
        settled = true; clearTimeout(deadline); signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else { try { resolve(fix(position!)); } catch { reject(new PhoneLocationError('unavailable')); } }
      };
      const abort = () => { cancelNative(); finish(new PhoneLocationError('aborted')); };
      // Stopping UI wait is not native cancellation. Only an actually settled
      // native timeout may suggest another explicit request.
      const deadline = setTimeout(() => { cancelNative(); finish(new PhoneLocationError('pending')); }, 12000);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      try {
        // Other platforms retain the official one-shot contract. Android's
        // request ID links cancellation to this call, including permission wait.
        const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0,
          ...(Capacitor.getPlatform() === 'android' ? { requestId: requestId = crypto.randomUUID() } : {}) };
        this.nativePending = true;
        void Geolocation.getCurrentPosition(options)
          .then(position => { this.nativePending = false; finish(undefined, position); },
            error => { this.nativePending = false; finish(failure(error)); });
      } catch (error) { this.nativePending = false; finish(failure(error)); }
    });
  }
}
