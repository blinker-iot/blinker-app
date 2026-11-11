import { Component, EventEmitter, Input, Output, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceUiPort } from '../../../core/device-v2/device-ui.port';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { DataService } from '../../../core/services/data.service';
import { DeviceCardEditor } from '../../device-card-editor.service';
import { DeviceblockZone } from '../deviceblock-zone/deviceblock-zone';
import { RoomListComponent } from '../room-list/room-list';
import { TabDeviceComponent } from './tab-device';

@Component({ selector: 'room-list', template: '' })
class RoomListStub {
  @Input() roomid = -1;
  @Output() roomidChange = new EventEmitter<number>();
}

@Component({ selector: 'deviceblock-zone', template: '' })
class DeviceZoneStub {
  @Input() roomid = -1;
  @Input() editing = false;
  @Output() roomidChange = new EventEmitter<number>();
}

@Component({ template: '' })
class RouteStub {}

@Pipe({ name: 'translate' })
class TranslateStub implements PipeTransform {
  transform(value: string): string { return value; }
}

// Production tab template, page-scoped editor and bounded preference store;
// child inventory/gesture views, lifecycle, radio, account data and storage are local doubles.
describe('device tab rendered card editor (local account/radio/storage doubles)', () => {
  let fixture: ComponentFixture<TabDeviceComponent>;
  let editor: DeviceCardEditor;
  let values: Map<string, string>;
  let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };
  let alerts: { create: ReturnType<typeof vi.fn> };
  let data: {
    auth: { uuid: string } | null;
    sessionEpoch: number;
    device: { list: string[]; dict: Record<string, { name: string; config: { card: { layout: string } } }> };
    room: { list: string[]; dict: Record<string, string[]> };
    authDataChanged: Subject<void>;
    userDataLoader: BehaviorSubject<boolean>;
    deviceDataLoader: BehaviorSubject<boolean>;
  };

  beforeEach(async () => {
    values = new Map();
    storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    };
    vi.stubGlobal('localStorage', storage);
    data = {
      auth: { uuid: 'card-editor-account' }, sessionEpoch: 1,
      device: { list: ['device-a'], dict: { 'device-a': { name: '客厅灯', config: { card: { layout: 'standard' } } } } },
      room: { list: ['客厅'], dict: { 客厅: ['device-a'] } },
      authDataChanged: new Subject<void>(), userDataLoader: new BehaviorSubject(true),
      deviceDataLoader: new BehaviorSubject(true),
    };
    alerts = { create: vi.fn(async () => ({ present: async () => undefined,
      onDidDismiss: async () => ({ role: 'destructive' }) })) };
    TestBed.overrideComponent(TabDeviceComponent, {
      remove: { imports: [RoomListComponent, DeviceblockZone, TranslatePipe] },
      add: { imports: [RoomListStub, DeviceZoneStub, TranslateStub] },
    });
    await TestBed.configureTestingModule({ imports: [TabDeviceComponent], providers: [
      provideRouter([{ path: 'home/device', component: RouteStub }]), provideIonicAngular({ animated: false }),
      { provide: DataService, useValue: data }, { provide: AlertController, useValue: alerts },
      { provide: AppVisibilityService, useValue: { active: new BehaviorSubject(true) } },
      { provide: DeviceUiPort, useValue: {
        watchBleAdapterEnabled: vi.fn(() => new BehaviorSubject(false)),
        refreshBlePresence: vi.fn(async () => undefined),
        sendCommand: vi.fn(),
      } },
    ] }).compileComponents();
    await TestBed.inject(Router).navigateByUrl('/home/device');
    fixture = TestBed.createComponent(TabDeviceComponent);
    editor = fixture.debugElement.injector.get(DeviceCardEditor);
    expect(fixture.componentInstance.cardEditor).toBe(editor);
    await settled();
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  async function settled(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function begin(): Promise<void> {
    // The child list's long-press entry is covered separately; retain the real editor here.
    expect(editor.begin(undefined, ['device-a'], 'device-a')).toBe(true);
    await settled();
  }

  function button(label: string, selector = 'button, ion-button'): HTMLElement & { disabled?: boolean } {
    const match = [...fixture.nativeElement.querySelectorAll(selector)]
      .find((candidate: HTMLElement) => candidate.getAttribute('aria-label') === label
        || candidate.shadowRoot?.querySelector('[part="native"]')?.getAttribute('aria-label') === label
        || candidate.textContent?.trim() === label);
    expect(match, label).toBeDefined();
    return match as HTMLElement & { disabled?: boolean };
  }

  async function click(label: string, selector?: string): Promise<void> {
    const element = button(label, selector);
    expect(element.disabled).not.toBe(true);
    element.click();
    await settled();
  }

  it('shows only accessible cancel/save icons and cancels the card-panel draft without a write or command', async () => {
    await begin();
    expect(button('取消编辑').closest('ion-buttons')?.getAttribute('slot')).toBe('start');
    expect(button('保存卡片').closest('ion-buttons')?.getAttribute('slot')).toBe('end');
    expect(button('取消编辑').querySelector('.fa-xmark[aria-hidden="true"]')).not.toBeNull();
    expect(button('保存卡片').querySelector('.fa-check[aria-hidden="true"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('ion-title, .card-size-editor, .room-list-fixed')).toBeNull();
    // The unified card panel owns size/content UI; here retain the real outer draft/save boundary.
    editor.setLayout('device-a', 'wide'); await settled();
    expect(editor.layout('device-a')).toBe('wide');
    expect(data.device.dict['device-a'].config.card.layout).toBe('standard');
    expect(storage.setItem).not.toHaveBeenCalled();
    await click('取消编辑');
    expect(editor.editing()).toBe(false);
    expect(editor.layout('device-a')).toBe('standard');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(alerts.create).not.toHaveBeenCalled();
    expect(TestBed.inject(DeviceUiPort).sendCommand).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('room-list')).not.toBeNull();
  });

  it('saves one preference record and retains editing with a visible error when a later write fails', async () => {
    await begin(); editor.setLayout('device-a', 'wide'); await settled(); await click('保存卡片');
    expect(editor.editing()).toBe(false);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(values.size).toBe(1);
    const saved = [...values.values()][0];
    expect(JSON.parse(saved).layouts['device-a']).toBe('wide');
    await begin(); editor.setLayout('device-a', 'standard'); await settled();
    storage.setItem.mockImplementationOnce(() => { throw Error('local storage full'); });
    await click('保存卡片');
    expect(editor.editing()).toBe(true);
    expect(editor.dirty()).toBe(true);
    expect(editor.layout('device-a')).toBe('standard');
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('未保存');
    expect([...values.values()]).toEqual([saved]);
    expect(data.device.dict['device-a'].config.card.layout).toBe('standard');
    expect(TestBed.inject(DeviceUiPort).sendCommand).not.toHaveBeenCalled();
  });

  it('retains save/drag guards without reintroducing a toolbar settings shortcut', async () => {
    await begin();
    expect(fixture.nativeElement.querySelector('[aria-label="设备卡片大小"], .card-size-options')).toBeNull();
    editor.setDragging(true); await settled();
    expect(button('保存卡片').disabled).toBe(true);
    expect(button('取消编辑').disabled).toBe(false);
    editor.setDragging(false); await settled();
    expect(button('保存卡片').disabled).toBe(false);
    expect(TestBed.inject(DeviceUiPort).sendCommand).not.toHaveBeenCalled();
  });

  it('keeps both editor hit targets at 44px despite the shared 32px icon header rule', async () => {
    await begin();
    const sectionStyle = document.createElement('style');
    sectionStyle.textContent = `ion-header ion-toolbar ion-buttons
      ion-button:not(.header-back):is(.header-action, :has(> i)) {
        width: 32px; height: 32px; min-width: 32px; min-height: 32px;
      }`;
    document.head.append(sectionStyle);
    try {
      for (const label of ['取消编辑', '保存卡片']) {
        const style = getComputedStyle(button(label));
        expect(style.width).toBe('44px');
        expect(style.height).toBe('44px');
        expect(style.minWidth).toBe('44px');
        expect(style.minHeight).toBe('44px');
      }
    } finally { sectionStyle.remove(); }
  });

  it('shows guest and corrupt-preference entry errors even when editing never starts', async () => {
    data.auth = null; data.sessionEpoch++; data.authDataChanged.next();
    expect(editor.begin(undefined, ['device-a'], 'device-a')).toBe(false);
    await settled();
    expect(editor.editing()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('先登录');
    storage.getItem.mockImplementation((key: string) => key.startsWith('blinker-v2-home-cards:') ? '{broken' : null);
    data.auth = { uuid: 'card-editor-account' }; data.sessionEpoch++; data.authDataChanged.next();
    expect(editor.begin(undefined, ['device-a'], 'device-a')).toBe(false);
    await settled();
    expect(editor.editing()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('暂不可用');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
