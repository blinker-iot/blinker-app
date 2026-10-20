import { ServerInterceptor } from '../../src/app/core/injectable/server.interceptor';
import { HTTP_INTERCEPTORS, HttpClient, HttpXhrBackend } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
// Isolated QA: production pages and HTTP generation chain, simulated device/persistence.
import { Component, inject, provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { defineCustomElement as defineIonBackButton } from '@ionic/core/components/ion-back-button.js';
import { BehaviorSubject, Subject } from 'rxjs';
import { appConfig } from '../../src/app/app.config';
import { DeviceUicPage } from '../../src/app/sections/device/device-uic/device-uic.page';
import { DevicePage } from '../../src/app/device/device.page';
import { DataService } from '../../src/app/core/services/data.service';
import { DeviceService } from '../../src/app/core/services/device.service';
import { DeviceUiPort } from '../../src/app/core/device-v2/device-ui.port';
import { DeviceV2PageLayoutService } from '../../src/app/core/services/device-v2-page-layout.service';
import { InterfaceGenerationService } from '../../src/app/sections/device/device-uic/interface-generation.service';
import { NativeService } from '../../src/app/core/services/native.service';
import { ViewService } from '../../src/app/core/services/view.service';
import { DebugService } from '../../src/app/debug/debug.service';
import { TipService } from '../../src/app/core/services/tip.service';
import { BTipComponent } from '../../src/app/core/components/b-tip/b-tip.component';
import { LAYOUTER2_PREVIEW_DATA, LAYOUTER2_PREVIEW_DEVICE_DATA } from '../../src/app/device/layouter2/layouter2-preview.data';

defineIonBackButton();
document.documentElement.classList.add('dark');
const fixtureNoCapabilities = new URLSearchParams(window.location.search).has('no-capabilities');
const fixtureSlowConnection = new URLSearchParams(window.location.search).has('slow-connection');
const snapshot = { manifestAccepted: !fixtureNoCapabilities, manifestFingerprint: 'a'.repeat(64), manifestRevision: 1, stateFresh: true, stateRevision: 1,
  endpoints: [
    { id: 1, key: 'switch', role: 'property', valueType: 'boolean', writable: true, readable: true, notifies: true, value: true },
    { id: 2, key: 'temperature', role: 'property', valueType: 'number', writable: false, readable: true, notifies: true, value: 24.6, unit: '°C' },
    { id: 3, key: 'humidity', role: 'property', valueType: 'number', writable: false, readable: true, notifies: true, value: 61, unit: '%' },
    { id: 4, key: 'brightness', role: 'property', valueType: 'integer', writable: true, readable: true, notifies: true, value: 65, minimum: 0, maximum: 100, step: 1, unit: '%' },
    { id: 5, key: 'refresh', role: 'action', valueType: 'null', writable: true, readable: false, notifies: false },
    { id: 6, key: 'label', role: 'property', valueType: 'text', writable: true, readable: true, notifies: true, value: '客厅', maxLength: 32 },
  ] };
const device = { id: 'studio-fixture', deviceName: 'studio-fixture', config: { customName: '客厅环境控制器', mode: 'bbp2', broker: '', component: 'DeviceV2', layouter: JSON.stringify(LAYOUTER2_PREVIEW_DATA) }, data: { ...LAYOUTER2_PREVIEW_DEVICE_DATA, enable: true, state: 'online' }, subject: new Subject(), storage: {} };
let record: any = null;
let qaScenario = 'success';
@Component({ selector: 'app-root', standalone: true, imports: [IonicModule, BTipComponent, FormsModule], template: '<ion-app><ion-router-outlet></ion-router-outlet><div class="notice-stack">@for (tip of tips.list; track tip) { <b-tip [tip]="tip" /> }</div><aside class="fixture-label">交互验收 · 模拟设备 / {{ modelLabel }} <button (click)="toggleTheme()">切换主题</button>@if (!liveModel) { <select aria-label="模拟模型场景" [ngModel]="scenario" (ngModelChange)="setScenario($event)"><option value="success">正常流式</option><option value="interrupted">中途断流</option><option value="unavailable">服务未配置</option></select> }</aside></ion-app>', styles: ['.fixture-label{position:fixed;bottom:0;left:0;z-index:999;font-size:9px;color:#9bb7ac;background:#112b25;padding:3px 8px;pointer-events:auto}'] })
class PreviewApp {
  constructor(public tips: TipService) {}
  liveModel = false;
  modelLabel = '模拟 AI';
  async ngOnInit() {
    const config = await fetch('/studio-api/config').then(response => response.json());
    this.liveModel = config.liveModel;
    this.modelLabel = config.liveModel ? `真实 ${config.model}` : '模拟 AI';
  }
  scenario = 'success';
  setScenario(value: string) { this.scenario = value; qaScenario = value; }
  toggleTheme() { document.documentElement.classList.toggle('dark'); }
}
const connected = new BehaviorSubject('ready');
bootstrapApplication(PreviewApp, { providers: [provideZoneChangeDetection(), ...appConfig.providers,
  provideRouter([
    { path: 'device-manager/:id/uic', component: DeviceUicPage }, { path: 'device/:id', component: DevicePage },
    { path: '**', redirectTo: '/device-manager/studio-fixture/uic' }
  ]),
  { provide: DataService, useValue: { device: { dict: { 'studio-fixture': device }, list: ['studio-fixture'] }, userDataLoader: new BehaviorSubject(true), initCompleted: new BehaviorSubject(true), authDataChanged: new Subject() } },
  { provide: DeviceService, useValue: { saveDeviceConfig: async () => true, connectDevice: async () => {}, disconnectDevice() {}, queryDevice() {}, queryRealtimeData() {}, sendData() {} } },
  { provide: DeviceUiPort, useValue: { appActive: new BehaviorSubject(true), isBleDirect: () => false, watchState: () => new BehaviorSubject(snapshot), watchConnection: () => connected,
    watchConnectivity: () => new BehaviorSubject({ activeTransport: 'cloud', directConnectAllowed: false, cloudSessionState: 'ready' }), watchEvents: () => new Subject(),
    openConnection: () => ({ ready: fixtureSlowConnection ? new Promise<void>(() => {}) : Promise.resolve(), close() {}, closed: new Promise(() => {}), signal: new AbortController().signal }), sendCommand: async () => {} } },
  { provide: DeviceV2PageLayoutService, useValue: { get: async () => record, saveCandidate: async (_id: string, layout: any) => record = { layout: { ...layout, revision: (record?.revision || 0) + 1 }, revision: (record?.revision || 0) + 1, manifestFingerprint: snapshot.manifestFingerprint } } },
  { provide: InterfaceGenerationService, useFactory: () => {
    const backend = new HttpXhrBackend({ build: () => new XMLHttpRequest() });
    const interceptor = inject(HTTP_INTERCEPTORS).find(value => value instanceof ServerInterceptor)!;
    return new InterfaceGenerationService(new HttpClient({ handle: request => interceptor.intercept(request, { handle: prepared => backend.handle(prepared.clone({
      url: '/studio-api/interface/generate', setHeaders: { 'X-Studio-Scenario': qaScenario },
    })) }) }));
  } },
  { provide: NativeService, useValue: { init() {}, allStop() {} } },
  { provide: ViewService, useValue: { disableSwipeBack() {}, enableSwipeBack() {} } },
  { provide: DebugService, useValue: { init() {}, end() {}, clean() {}, dataList: { 'studio-fixture': [] }, state: new Subject(), subject: new Subject() } },
] }).catch(console.error);
