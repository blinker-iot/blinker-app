import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ManagedDeviceCreateInput,
  ManagedDeviceCreateResponse,
  ManagedDeviceService,
} from './managed-device.service';

export interface ManagedCreateAttempt {
  readonly idempotencyKey: string;
  readonly input: ManagedDeviceCreateInput;
}

@Injectable({ providedIn: 'root' })
export class ManagedDeviceCreateService {
  constructor(private readonly devices: ManagedDeviceService) {}

  begin(input: ManagedDeviceCreateInput): ManagedCreateAttempt {
    return {
      idempotencyKey: this.newIdempotencyKey(),
      input: {
        name: input.name.trim(),
        deviceType: input.deviceType.trim() || 'diy',
      },
    };
  }

  /** Retry the same logical attempt with its original idempotency key. */
  execute(attempt: ManagedCreateAttempt): Promise<ManagedDeviceCreateResponse> {
    return firstValueFrom(this.devices.createDevice(
      attempt.input,
      attempt.idempotencyKey,
    ));
  }

  private newIdempotencyKey(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `create-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}
