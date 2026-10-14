import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

export interface PublicConsoleBookmark {
  logicalDeviceId: string;
  name: string;
  token: string;
  savedAt: number;
}

// Identity, navigation and local bookmarks belong to the host. Live data uses the API.
export interface DeviceConsoleHost {
  readonly authenticated: boolean;
  readonly sessionVersion: number;
  readonly activeChanges: Observable<boolean>;
  readonly sessionChanges: Observable<unknown>;
  readonly homeHref: string;
  readonly consoleWebBaseUrl: string;

  requestLogin(token: string): Promise<void>;
  openDevice(deviceId: string, sessionVersion: number): Promise<boolean>;
  copyText(text: string): Promise<void>;
  readPublicDevices(): Promise<unknown>;
  writePublicDevices(devices: readonly PublicConsoleBookmark[]): Promise<void>;
}

export const DEVICE_CONSOLE_HOST = new InjectionToken<DeviceConsoleHost>('DEVICE_CONSOLE_HOST');
export const DEVICE_CONSOLE_API_BASE = new InjectionToken<string>('DEVICE_CONSOLE_API_BASE');
