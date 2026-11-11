import { Subscription } from 'rxjs';
import { API } from 'src/app/configs/api.config';
import { captureDeviceV2AccountContext } from 'src/app/core/device-v2/account-scope';
import type { DataService } from 'src/app/core/services/data.service';

interface RoomReadAttempt {
  generation: number;
  authority: string;
  sessionEpoch: number;
  hadAuth: boolean;
  missingIdentity: boolean;
}

/** Page-local cold-read recovery; never reload an accepted editing draft. */
export class RoomReadRecovery {
  private active = true;
  private generation = 0;
  private pending?: Subscription;

  constructor(private readonly data: DataService) {}

  enter(): void { this.active = true; }

  leave(): void {
    this.active = false;
    this.generation++;
    this.pending?.unsubscribe();
    this.pending = undefined;
  }

  begin(): RoomReadAttempt | undefined {
    this.pending?.unsubscribe();
    this.pending = undefined;
    if (!this.active) return undefined;
    return {
      generation: ++this.generation, authority: API.BASE_URL,
      sessionEpoch: this.data.sessionEpoch, hadAuth: !!this.data.auth,
      missingIdentity: !this.data.auth?.uuid && !this.data.user?.id,
    };
  }

  current(attempt: RoomReadAttempt): boolean {
    return this.active && this.generation === attempt.generation && API.BASE_URL === attempt.authority;
  }

  accepts(attempt: RoomReadAttempt): boolean {
    return this.current(attempt) && this.data.sessionEpoch === attempt.sessionEpoch;
  }

  afterFailure(error: unknown, attempt: RoomReadAttempt, retry: () => void): void {
    if (!this.current(attempt) || !attempt.missingIdentity
      || !(error instanceof Error) || error.message !== 'DEVICE_V2_ACCOUNT_SCOPE_INVALID') return;

    const pending = new Subscription();
    this.pending = pending;
    const stop = () => { pending.unsubscribe(); if (this.pending === pending) this.pending = undefined; };
    const check = (announced = false) => {
      // Native restore advances the initially empty session once. An existing
      // token may only acquire its UUID within the same session, never a logout.
      const epoch = this.data.sessionEpoch;
      if (!this.current(attempt) || epoch < attempt.sessionEpoch
        || epoch > attempt.sessionEpoch + (attempt.hadAuth ? 0 : 1)
        || (announced && !this.data.auth)) { stop(); return; }
      if (!this.data.auth) { if (epoch !== attempt.sessionEpoch) stop(); return; }
      try { captureDeviceV2AccountContext(this.data, attempt.authority); }
      catch { return; }
      stop();
      queueMicrotask(() => {
        if (this.current(attempt) && this.data.sessionEpoch === epoch && this.data.auth) retry();
      });
    };
    pending.add(this.data.authDataChanged.subscribe(() => check(true)));
    // The restore event may precede this rejected Promise's catch handler.
    check();
  }
}
