import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { Subscription } from 'rxjs';

import {
  AlertController,
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  NavController,
  ToastController,
} from '@ionic/angular/standalone';
import { ActivatedRoute } from '@angular/router';
import { API } from 'src/app/configs/api.config';
import { getServiceRegion } from 'src/app/configs/service-region.config';
import { environment } from '../../../environments/environment';
import { bleScanner } from 'src/app/core/bluetooth/scan';
import { assertDeviceV2AccountContext, captureDeviceV2AccountContext,
  DeviceV2AccountContext } from 'src/app/core/device-v2/account-scope';
import {
  CapacitorBleControllerCredentialStore,
  clearBleControllerCredentialSecrets,
} from 'src/app/core/device-v2/ble-direct';
import { CapacitorEsp32ProvisioningTransport } from 'src/app/core/device-v2/provisioning/capacitor-esp32-wifiprov.transport';
import {
  decodeBlinkerConfigInfo,
  encodeBlinkerConfigInfoRequest,
  configureBlinkerAccess,
  BLINKER_CONFIG_ENDPOINT,
  BlinkerConfigOperation,
  BlinkerConfigInfo,
  Esp32ProvisioningTransport,
} from 'src/app/core/device-v2/provisioning/esp32-wifiprov';
import { DeviceUiPort } from 'src/app/core/device-v2/device-ui.port';
import { WiFiProvAdmin, WiFiProvIdentity } from 'src/app/core/device-v2/provisioning/wifiprov-admin';
import { base64UrlEncode } from 'src/app/core/device-v2/base64url';
import { WiFiProvRekeyCoordinator } from 'src/app/core/device-v2/provisioning/wifiprov-rekey-coordinator';
import { HttpWiFiProvRekeyGateway } from 'src/app/core/device-v2/provisioning/wifiprov-rekey-gateway';
import { CapacitorWiFiProvRekeyJournal } from 'src/app/core/device-v2/provisioning/wifiprov-rekey-journal';
import { authorizeWiFiProvRekeySetup } from 'src/app/core/device-v2/provisioning/wifiprov-rekey-wire';
import { allocationContext, WiFiProvAllocation, sameAllocationContext } from 'src/app/core/device-v2/provisioning/wifiprov-allocation';
import { createFreshSealed, reconcileSealedInstallation }
  from 'src/app/core/device-v2/provisioning/wifiprov-sealed-allocation';
import type { WiFiProvSealedInstallation } from 'src/app/core/device-v2/provisioning/wifiprov-sealed-installation-contract';
import { assertWiFiProvWritePreflight } from 'src/app/core/device-v2/provisioning/wifiprov-write-preflight';
import { invalidateKnownCredentialRoot } from 'src/app/core/device-v2/ble-direct/credential-root-lifecycle';
import { supportsFirstInstall, WiFiProvFirstInstallPort }
  from 'src/app/core/device-v2/provisioning/wifiprov-first-install';
import { readWiFiProvPoP } from 'src/app/core/device-v2/provisioning/wifiprov-pop';
import { explicitWiFiRejectionReason, WiFiProvWiFiFailureReason }
  from 'src/app/core/device-v2/provisioning/wifiprov-wifi-failure';
import { supportsWifiReconfigure, WiFiProvWifiReconfigurePort }
  from 'src/app/core/device-v2/provisioning/wifiprov-wifi-reconfigure';
import { WiFiProvCloudCheck, WiFiProvCloudObservation, WiFiProvCloudReconciliation, WiFiProvUnknownWiFiReceipt }
  from 'src/app/core/device-v2/provisioning/wifiprov-cloud-reconciliation';
import { confirmWiFiProvCompletion, wiFiProvCompletionResult, WiFiProvCompletionResult, WiFiProvOfficialReceipt }
  from 'src/app/core/device-v2/provisioning/wifiprov-completion';
import { createWiFiProvUnknownCheckpoint, wiFiProvUnknownAvailability, WiFiProvUnknownRecovery }
  from 'src/app/core/device-v2/provisioning/wifiprov-unknown-checkpoint';
import { waitForWiFiProvAccount } from 'src/app/core/device-v2/provisioning/wifiprov-account-ready';
import { readWiFiProvSoftApAttempt } from 'src/app/core/device-v2/provisioning/wifiprov-network-state';
import { WiFiProvSoftApStages, WiFiProvSoftApHandoff, consumeWiFiProvSoftApHandoff,
  assertWiFiProvSoftApHandoff, isolatedWiFiProvOwner } from 'src/app/core/device-v2/provisioning/wifiprov-softap-stages';
import { readSystemConnectedConfigInfo, supportsSystemConnectedConfigInfo }
  from 'src/app/core/device-v2/provisioning/wifiprov-config-info-read';
import { WiFiProvCloudLease, wiFiProvCloudBoundary } from 'src/app/core/device-v2/provisioning/wifiprov-cloud-boundary';
import { WiFiProvSoftApAcquisition } from 'src/app/core/device-v2/provisioning/wifiprov-softap-acquisition';
import { assertProvisioningWritable, assertSystemConnectedReadOnly, supportsSystemConnectedReadOnly, systemConnectedErrorMessage }
  from 'src/app/core/device-v2/provisioning/wifiprov-system-connected';
import { assertWiFiProvCloudTransport, protectedWiFiProvManagement,
  WiFiProvManagement } from 'src/app/core/device-v2/provisioning/wifiprov-management-port';
import { logicalDevicePeerId } from 'src/app/core/protocol/device-v2';
import { CapacitorWiFiProvAllocationStore } from 'src/app/core/device-v2/provisioning/wifiprov-allocation-store';
import { WiFiProvRetirement } from 'src/app/core/device-v2/provisioning/wifiprov-retirement';
import { sameBytes } from 'src/app/core/device-v2/ble-direct/wire';
import { DeviceV2ManagementService } from 'src/app/core/services/device-v2-management.service';
import { DataService } from 'src/app/core/services/data.service';
import { UserService } from 'src/app/core/services/user.service';
import { AppVisibilityService, AppVisibilityTransition } from 'src/app/core/services/app-visibility.service';
import { DeviceKeyContext } from 'src/app/core/model/response.model';
import {
  BleDevice,
  ConnectOptions,
  PlatformCapabilities,
  SoftApPurpose,
  ProvisionResult,
  ProvisioningDevice,
  WifiNetwork,
  WiFiProv,
  WiFiProvTransport,
} from 'capacitor-wifiprov';

type ProvisionPhase =
  | 'idle'
  | 'context'
  | 'permissions'
  | 'scanning'
  | 'selecting'
  | 'connecting'
  | 'ready'
  | 'provisioning'
  | 'success'
  | 'error';

interface SavedNetwork {
  ssid: string;
  password: string;
  remember: boolean;
}

interface AllocationBase {
  logicalDeviceId: string;
  deviceKey: string;
  deviceInstanceId: Uint8Array;
  accessEpoch: number;
  networkOnlyReconfiguration?: true;
}

type PreservedAccessAllocation = AllocationBase & {
  preserveAccess: true;
  credentialStored: true;
};

type CloudOnlyAllocation = AllocationBase & {
  preserveAccess: false;
  credentialStored: true;
};

type BootstrapAllocation = AllocationBase & {
  preserveAccess: false;
  directBootstrap: true;
  credentialVersion: number;
  locator: string;
};

type DeviceAllocation =
  | PreservedAccessAllocation
  | CloudOnlyAllocation
  | BootstrapAllocation;

type ProvisionAccountContext = DeviceV2AccountContext & { generation: number };
type SoftApConnectionMode = NonNullable<ConnectOptions['softApConnectionMode']>;

interface SuspendedSoftApHandoff {
  readonly checkpoint: WiFiProvSoftApHandoff;
  readonly account: DeviceV2AccountContext;
  readonly identity?: Readonly<DeviceKeyContext>;
}

interface UnknownWiFiReceipt extends WiFiProvUnknownWiFiReceipt {
  readonly account: DeviceV2AccountContext;
  readonly identity: DeviceKeyContext;
  readonly reader: WiFiProvCloudReconciliation;
  recovery?: WiFiProvUnknownRecovery;
}

interface CompletionAttempt extends WiFiProvUnknownWiFiReceipt {
  readonly account: DeviceV2AccountContext;
  readonly rekey?: true;
}

@Component({
  selector: 'app-esp32-provision',
  templateUrl: './esp32-provision.page.html',
  styleUrls: ['./esp32-provision.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
  ],
})
export class Esp32ProvisionPage implements OnInit, OnDestroy {
  transport: WiFiProvTransport = 'ble';
  readonly security = 1;
  devicePrefix = 'BLINKER_';
  deviceName = 'BLINKER_';
  softApPassword = '';
  provisioningPoP = '';
  provisioningPoPVisible = false;
  provisioningPoPError = '';

  devices: BleDevice[] = [];
  selectedDevice?: ProvisioningDevice;
  networks: WifiNetwork[] = [];
  ssid = '';
  password = '';
  passwordVisible = false;
  rememberNetwork = false;
  scanningNetworks = false;
  blinkerDeviceName = 'ESP32 WiFiBLE';

  phase: ProvisionPhase = 'idle';
  statusMessage = '选择配网方式并连接处于配网模式的 ESP32';
  progress = 0;
  result?: ProvisionResult;
  capabilities?: PlatformCapabilities;
  readonly nativeSupported = Capacitor.isNativePlatform();
  handoffWaiting?: 'cloud' | 'local';
  acquisitionWaiting = false;
  wifiCloudState: 'idle' | 'checking' | WiFiProvCloudCheck | 'error' = 'idle';
  unknownRecoveries: WiFiProvUnknownRecovery[] = [];
  unknownRecoveryLoading = false;
  unknownRecoveryError = '';
  wifiCheckpointState: 'idle' | 'saving' | 'saved' | 'unconfirmed' = 'idle';
  completion?: WiFiProvCompletionResult;
  completionActionMessage = '';

  private listeners: PluginListenerHandle[] = [];
  private scanTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  private viewActive = true;
  private generation = 0;
  private closeFailed = false;
  private readonly subscriptions = new Subscription();
  private initializing?: Promise<void>;
  private selectionStarting?: Promise<ProvisioningDevice>;
  private allocation?: DeviceAllocation;
  private rotationIdempotencyKey = '';
  private accountContext?: ProvisionAccountContext;
  private reconfigureContext?: DeviceKeyContext;
  private readonly reconfigureTarget: string | null;
  private reconfigureReady = false;
  private reconfigureAbort?: AbortController;
  // clearState is not proof that SDK callbacks can no longer rebind the process.
  // Keep the legacy main-process fence; isolated worker sessions never clear it.
  private softApNetworkUnconfirmed = false;
  private cloudNetworkAbort = new AbortController();
  private provisionTransport?: WiFiProvTransport;
  private provisioningGeneration?: number;
  private softApStages?: WiFiProvSoftApStages;
  private softApCloudLease?: WiFiProvCloudLease;
  private softApIsolatedOwner?: ReturnType<typeof isolatedWiFiProvOwner>;
  private suspendedHandoff?: SuspendedSoftApHandoff;
  private confirmedIdentityContext?: DeviceKeyContext;
  private localAcquisition?: WiFiProvSoftApAcquisition;
  private visibilityReason?: AppVisibilityTransition['reason'];
  private pauseRetained = false;
  private stageClosing?: Promise<void>;
  private softApSpec?: { name: string; transport: 'softap'; security: 1; softApPassword?: string; pop?: string; softApPurpose?: SoftApPurpose };
  private selectedSoftApMode: SoftApConnectionMode = 'sdk-managed';
  private firstInstallRequested = false;
  private firstInstallPort?: WiFiProvFirstInstallPort;
  private wifiReconfigureRequested = false;
  private wifiReconfigurePort?: WiFiProvWifiReconfigurePort;
  private pendingWiFi?: UnknownWiFiReceipt;
  private unknownWiFi?: UnknownWiFiReceipt;
  private wifiCloudAbort?: AbortController;
  private completionAbort?: AbortController;
  private completionNavigationAbort?: AbortController;
  private completionAttempt?: CompletionAttempt;
  private completionOpening = false;
  private nativeWiFiFailureReason?: WiFiProvWiFiFailureReason;
  private unknownHintsAbort?: AbortController;
  private unknownHintsAccount?: DeviceV2AccountContext;
  private checkpointSaving?: Promise<void>;
  private recoveryBusy = false;
  sealedRecoveries: readonly WiFiProvSealedInstallation[] = [];
  sealedRecoveryMessage = '';
  private sealedReadAbort?: AbortController;
  private sealedHintsAccount?: DeviceV2AccountContext;
  private sealedInstall?: { instance: Uint8Array; requestId: string };
  private sealedInstallingGeneration?: number;
  private recoveryBlocked = false;
  private manualPreparing = false;
  private manualPreparation?: object;
  private pluginRelease?: Promise<void>;
  private discoveryLease?: Promise<() => void>;
  private discoveryStarting?: Promise<void>;
  private discoveryStopping?: Promise<boolean>;
  private readonly rawProvisioningTransport = new CapacitorEsp32ProvisioningTransport();
  private readonly provisioningTransport: Esp32ProvisioningTransport = {
    request: (endpoint, payload) => {
      assertProvisioningWritable(this.readOnlySoftAp);
      const work = () => this.manualWritableSoftAp
        ? this.requireManualWritePort().request(endpoint, payload)
        : this.rawProvisioningTransport.request(endpoint, payload);
      return this.softApStages
        ? this.softApStages.request(endpoint, payload, work) : work();
    },
  };
  private readonly controllerCredentials: CapacitorBleControllerCredentialStore;
  private readonly allocationStore: CapacitorWiFiProvAllocationStore;

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private toastController: ToastController,
    private deviceManagement: DeviceV2ManagementService,
    private userService: UserService,
    private dataService: DataService,
    private deviceUi: DeviceUiPort,
    private route: ActivatedRoute,
    private navController: NavController,
    private alertController: AlertController,
    private visibility: AppVisibilityService,
  ) {
    this.reconfigureTarget = this.route.snapshot.queryParamMap.get('mode') === 'reconfigure'
      ? this.route.snapshot.queryParamMap.get('logicalDeviceId') ?? '' : null;
    this.controllerCredentials = new CapacitorBleControllerCredentialStore(
      () => captureDeviceV2AccountContext(this.dataService, API.BASE_URL),
    );
    this.allocationStore = new CapacitorWiFiProvAllocationStore(
      () => captureDeviceV2AccountContext(this.dataService, API.BASE_URL),
    );
  }

  get reconfiguring(): boolean {
    return this.reconfigureTarget !== null || !!this.reconfigureContext;
  }

  get isScanning(): boolean {
    return this.phase === 'scanning';
  }

  get isConnecting(): boolean {
    return (
      this.phase === 'selecting' ||
      this.phase === 'connecting' ||
      this.phase === 'permissions'
    );
  }

  get isProvisioning(): boolean {
    return this.phase === 'provisioning' || this.provisioningGeneration === this.generation;
  }

  get sessionReady(): boolean {
    return !!this.selectedDevice?.connected;
  }

  get canOperate(): boolean {
    return !this.completion && !this.unknownWiFi && this.current(this.generation) && !this.pluginRelease && !this.closeFailed
      && this.softApStages?.state !== 'failed' && this.softApStages?.state !== 'cancelled'
      && (!this.usesRekeyPilot || this.rekeyPilotReady)
      && (this.reconfigureTarget === null || this.reconfigureReady);
  }

  get operationBusy(): boolean {
    return this.unknownRecoveryLoading || this.recoveryBusy || this.manualPreparing || !!this.localAcquisition || !!this.discoveryStopping
      || this.phase === 'context' || this.isConnecting || this.isProvisioning || this.scanningNetworks
      || this.completionChecking || this.completionOpening;
  }

  get canContinueAcquisition(): boolean {
    return this.current(this.generation) && this.acquisitionWaiting && !this.pluginRelease && !this.closeFailed;
  }

  get canProvision(): boolean {
    return !this.unknownWiFi && !this.readOnlySoftAp && this.canOperate && this.sessionReady
      && !this.operationBusy && !this.isScanning
      && !!this.ssid.trim()
      && (!this.usesRekeyPilot || (this.rekeyPilotReady && this.selectedDevice?.transport === 'ble'))
      && !!this.blinkerDeviceName.trim();
  }

  get usesRekeyPilot(): boolean {
    return this.reconfigureTarget !== null && environment.wifiProvRekeyPilotOperation !== undefined;
  }

  get rekeyPilotReady(): boolean {
    return this.usesRekeyPilot && Capacitor.getPlatform() === 'android' && getServiceRegion() === 'Development';
  }

  get sealedFirstInstallReady(): boolean {
    return environment.wifiProvSealedFirstInstall && this.reconfigureTarget === null
      && Capacitor.getPlatform() === 'android' && getServiceRegion() === 'Development';
  }

  get requiresBlePoP(): boolean { return this.usesRekeyPilot || (this.sealedFirstInstallReady && this.transport === 'ble'); }

  get firstInstallSoftAp(): boolean { return this.selectedSoftApMode === 'system-connected' && this.firstInstallRequested; }
  get wifiReconfigureSoftAp(): boolean { return this.selectedSoftApMode === 'system-connected' && this.wifiReconfigureRequested; }
  get manualWritableSoftAp(): boolean { return this.firstInstallSoftAp || this.wifiReconfigureSoftAp; }
  get wifiReceiptUnknown(): boolean { return !!this.unknownWiFi; }
  get completionChecking(): boolean { return this.completion?.cloud === 'checking'; }
  get canCheckCompletion(): boolean {
    if (!this.completion || this.completionChecking || this.completion.officialReceipt === 'rejected'
      || this.completion.cloud === 'blocked' || this.completion.outcome === 'ready' || !this.current(this.generation)
      || this.isProvisioning || this.closeFailed || this.recoveryBlocked || wiFiProvCloudBoundary.blocked
      || this.completionOpening || !!this.checkpointSaving) return false;
    if (!this.completionAccountCurrent()) return false;
    return this.unknownWiFi ? this.canCheckWiFiCloud : !!this.completionAttempt;
  }
  get canOpenCompletion(): boolean {
    if (this.completion?.outcome !== 'ready' || !this.current(this.generation) || this.completionChecking
      || this.isProvisioning || this.closeFailed || this.recoveryBlocked || wiFiProvCloudBoundary.blocked
      || this.completionOpening || !!this.checkpointSaving) return false;
    if (!this.completionAccountCurrent()) return false;
    return this.completion.officialReceipt === 'unknown' ? this.canCheckWiFiCloud : !!this.completionAttempt;
  }
  get canReturnToDeviceList(): boolean {
    return !!this.completion && this.completion.outcome !== 'ready' && this.current(this.generation)
      && !this.completionChecking && !this.isProvisioning && !this.completionOpening && !this.checkpointSaving;
  }
  get completionFailureMessage(): string {
    return this.nativeWiFiFailureReason === 'AUTH_FAILED' ? 'Wi-Fi 密码或认证失败，请核对路由器设置。'
      : this.nativeWiFiFailureReason === 'NETWORK_NOT_FOUND' ? '未找到目标 Wi-Fi，请检查名称、频段及信号。'
      : '设备明确报告未能连接目标 Wi-Fi。';
  }
  private completionAccountCurrent(): boolean {
    const attempt = this.unknownWiFi ?? this.completionAttempt;
    if (!attempt?.account || attempt.account.authority !== API.BASE_URL) return false;
    if (this.completionAttempt?.rekey && !this.rekeyPilotReady) return false;
    try { assertDeviceV2AccountContext(this.dataService, attempt.account); return true; }
    catch { return false; }
  }
  get activeUnknownRecovery(): WiFiProvUnknownRecovery | undefined {
    const entry = this.unknownWiFi?.recovery;
    return entry && this.unknownRecoveries.includes(entry) ? entry : undefined;
  }
  get canCheckWiFiCloud(): boolean {
    return !!this.unknownWiFi && this.current(this.generation) && !this.isProvisioning
      && this.wifiCloudState !== 'checking' && !this.closeFailed && !this.checkpointSaving && !this.recoveryBlocked
      && !this.recoveryBusy && !this.unknownRecoveryLoading
      && this.unknownAvailability(this.unknownWiFi) === 'available';
  }
  get readOnlySoftAp(): boolean { return this.selectedSoftApMode === 'system-connected' && !this.manualWritableSoftAp; }
  get canUseFirstInstall(): boolean { return !this.reconfiguring && supportsFirstInstall(this.capabilities); }
  get canUseWifiReconfigure(): boolean {
    return !this.usesRekeyPilot && this.reconfigureContextCurrent() && supportsWifiReconfigure(this.capabilities);
  }
  get canBeginWifiReconfigure(): boolean {
    return this.canUseWifiReconfigure && this.current(this.generation) && !this.completion && !this.unknownWiFi
      && !this.operationBusy && !this.isScanning && !this.sessionReady && !this.closeFailed
      && (this.phase === 'idle' || this.phase === 'error');
  }

  private reconfigureContextCurrent(): boolean {
    if (!this.reconfigureContext || !this.accountContext || this.reconfigureTarget !== this.reconfigureContext.logicalDeviceId
      || this.accountContext.authority !== API.BASE_URL) return false;
    try { assertDeviceV2AccountContext(this.dataService, this.accountContext); return true; }
    catch { return false; }
  }

  get canUseSystemConnectedReadOnly(): boolean {
    return !this.reconfiguring && supportsSystemConnectedReadOnly(this.capabilities);
  }

  async ngOnInit(): Promise<void> {
    this.restoreNetwork();
    if (this.visibility.transitions) this.subscriptions.add(this.visibility.transitions.subscribe(event => {
      this.visibilityReason = event.reason;
      this.pauseRetained = event.reason === 'pause' && this.localAcquisition?.pause() === true;
      // A stop must be observed even after pause already set active=false.
      if (this.localAcquisition && !this.cloudNetworkAbort.signal.aborted
        && (event.reason === 'stop' || (event.reason === 'pause' && !this.pauseRetained))) {
        this.suspendPage('配网已进入后台，请返回后手动重新开始。');
      }
    }));
    this.subscriptions.add(this.visibility.active.subscribe(active => {
      if (!active && !(this.visibilityReason === 'pause' && this.pauseRetained)) {
        this.suspendPage('配网已暂停，请返回后手动重新开始。', true);
      } else if (active && (this.acquisitionWaiting || this.phase === 'error')) this.cdr.detectChanges();
    }));
    this.subscriptions.add(this.dataService.authDataChanged.subscribe(() => {
      const expected = this.accountContext ?? this.unknownHintsAccount ?? this.sealedHintsAccount;
      if (!expected) return;
      try { assertDeviceV2AccountContext(this.dataService, expected); }
      catch {
        this.unknownRecoveries = []; this.unknownHintsAccount = undefined;
        this.sealedRecoveries = []; this.sealedHintsAccount = undefined; this.sealedRecoveryMessage = '';
        this.unknownRecoveryError = '登录账号已变化，请重新进入页面。';
        this.suspendPage('登录账号已变化，请重新进入配网页面。');
      }
    }));
    this.initializing = this.preparePage();
    await this.initializing;
  }

  private async preparePage(): Promise<void> {
    const generation = this.generation;
    if (this.reconfigureTarget === null) {
      await this.loadUnknownRecoveries();
      if (this.current(generation)) await this.loadSealedRecoveries();
    }
    if (!this.current(generation)) return;
    if (await this.loadReconfigureContext() && this.current(generation)) await this.initializePlugin();
  }

  private async initializePlugin(): Promise<void> {
    const generation = this.generation;
    if (!this.current(generation)) return;
    if (!this.nativeSupported) return;

    await this.bindPluginEvents();
    if (!this.current(generation)) return;
    try {
      const capabilities = await WiFiProv.getCapabilities();
      if (this.current(generation)) this.capabilities = capabilities;
    } catch (error) {
      if (this.current(generation)) this.setError(this.errorMessage(error, '无法读取配网插件能力'));
    }
  }

  async ionViewWillEnter(): Promise<void> {
    const returning = !this.viewActive;
    this.viewActive = true;
    if (returning && !this.destroyed) {
      if (this.completion || this.unknownWiFi || this.unknownRecoveries.length || this.unknownRecoveryError || this.sealedRecoveries.length) this.cdr.detectChanges(); // No resume or automatic read.
      else if (this.reconfigureTarget !== null) this.setError('配网已暂停，请手动重新开始以核对原设备；不会自动重试');
      else await this.startOver();
    }
  }

  ionViewWillLeave(): void {
    this.viewActive = false;
    this.suspendPage('配网已离开，请重新进入后继续。');
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.viewActive = false;
    this.subscriptions.unsubscribe();
    this.suspendPage('配网页面已关闭');
    this.clearAllocation();
  }

  private current(generation: number): boolean {
    return !this.destroyed && this.viewActive && this.visibility.active.value && generation === this.generation;
  }

  private suspendPage(message: string, preserveHandoff = false): void {
    this.cancelCompletion();
    this.completionNavigationAbort?.abort(); this.completionNavigationAbort = undefined;
    this.cancelWiFiCloudRead();
    this.unknownHintsAbort?.abort();
    this.sealedReadAbort?.abort();
    this.retainUnknownWiFi();
    if (this.unknownWiFi) {
      try { assertDeviceV2AccountContext(this.dataService, this.unknownWiFi.account); }
      catch { this.unknownWiFi = undefined; } // Durable credentials/intents remain untouched.
    }
    if (this.completionAttempt) {
      try { assertDeviceV2AccountContext(this.dataService, this.completionAttempt.account); }
      catch { this.completionAttempt = undefined; this.completion = undefined; }
    }
    // Preserve public intent only at a proven, idle handoff. Every old await
    // and owner still retires; returning cannot resume its continuation.
    this.suspendedHandoff = preserveHandoff ? this.captureHandoff() : undefined;
    this.firstInstallPort?.retire();
    this.wifiReconfigurePort?.retire();
    this.clearProvisioningPoP();
    const uncertain = this.isProvisioning;
    ++this.generation;
    this.localAcquisition?.cancel();
    this.acquisitionWaiting = false;
    this.pauseRetained = false;
    this.softApStages?.cancel();
    this.handoffWaiting = undefined;
    this.cloudNetworkAbort.abort();
    this.reconfigureAbort?.abort();
    this.reconfigureReady = false;
    this.clearScanTimer();
    this.selectedDevice = undefined;
    this.devices = []; this.networks = []; this.scanningNetworks = false; this.result = undefined;
    if (this.suspendedHandoff) {
      if (this.allocation) this.allocation.deviceKey = '';
      this.allocation = undefined; // Durable intent/CAS and UNKNOWN are not cleared.
    }
    this.setError(this.suspendedHandoff ? '配网阶段已暂停，请手动重新开始并重新核对原设备；不会自动恢复或重发。'
      : uncertain ? '配置结果尚未确认，请恢复后核对原设备；不会自动重发。' : message);
    void this.releasePlugin().catch(() => {
      this.closeFailed = true;
      this.setError('配网连接关闭尚未确认，请手动重新开始；不会启动其他扫描。');
    });
  }

  setTransport(transport: WiFiProvTransport): void {
    if (this.usesRekeyPilot && transport !== 'ble') return;
    if ((!this.canOperate && !(transport === 'softap' && this.canBeginWifiReconfigure))
      || this.isScanning || this.operationBusy || this.sessionReady) return;
    this.transport = transport;
    this.clearProvisioningPoP();
    this.devices = [];
    this.phase = 'idle';
    this.statusMessage =
      transport === 'ble'
        ? '扫描并选择附近处于配网模式的 ESP32'
        : '输入 ESP32 临时热点信息后建立连接';
  }

  async toggleBleScan(): Promise<void> {
    if (this.isScanning) {
      await this.stopBleScan();
    } else {
      await this.startBleScan();
    }
  }

  async startBleScan(): Promise<void> {
    if (!this.canOperate || this.isScanning || this.operationBusy || this.sessionReady) return;
    if (!this.nativeSupported) {
      await this.showToast('ESP32 配网需要在 Android 或 iOS App 中使用');
      return;
    }

    const generation = this.generation;
    try {
      await this.ensurePermissions('ble');
      if (!this.current(generation)) return;
      await this.acquireDiscovery();
      if (!this.current(generation)) return;
      this.devices = [];
      this.phase = 'scanning';
      this.statusMessage = '正在扫描附近的 ESP32 配网设备…';
      const starting = this.discoveryStarting = WiFiProv.startBleScan({
        prefix: this.devicePrefix.trim() || undefined,
        security: this.security,
      }).then(() => undefined);
      await starting;
      if (!this.current(generation) || this.discoveryStarting !== starting
        || this.discoveryStopping || this.phase !== 'scanning') return;
      this.clearScanTimer();
      this.scanTimer = setTimeout(() => void this.stopBleScan(), 12000);
    } catch (error) {
      if (this.current(generation)) this.setError(this.errorMessage(error, 'BLE 扫描启动失败'));
    }
  }

  stopBleScan(): Promise<boolean> {
    this.clearScanTimer();
    if (!this.nativeSupported) return Promise.resolve(true);
    if (this.discoveryStopping) return this.discoveryStopping;
    const generation = this.generation;
    const stopping = this.stopDiscovery(this.discoveryStarting, generation).finally(() => {
      if (this.discoveryStopping === stopping) this.discoveryStopping = undefined;
    });
    this.discoveryStopping = stopping;
    return stopping;
  }

  private async stopDiscovery(starting: Promise<void> | undefined, generation: number): Promise<boolean> {
    try {
      // An observed device can arrive before the start bridge promise. Drain
      // that exact acquisition before stopping it or admitting selection.
      await starting?.catch(() => undefined);
      if (!this.current(generation)) return false; // Page cleanup owns the close.
      this.clearScanTimer();
      await WiFiProv.stopBleScan();
    } catch {
      if (this.current(generation)) {
        this.closeFailed = true;
        this.setError('扫描停止尚未确认，请手动重新开始；不会继续连接设备。');
      }
      return false;
    }
    if (!this.current(generation)) return false;
    if (this.phase === 'scanning') {
      this.phase = 'idle';
      this.statusMessage = this.devices.length
        ? `已发现 ${this.devices.length} 台设备，请选择一台连接`
        : '未发现设备，请确认 ESP32 已进入配网模式';
    }
    return true;
  }

  async selectBleDevice(device: BleDevice): Promise<void> {
    if (!this.canOperate || this.operationBusy || this.sessionReady) return;
    if (this.usesRekeyPilot && !this.rekeyPilotReady) return;
    this.validateProvisioningPoP(this.usesRekeyPilot);
    if (this.provisioningPoPError) { document.getElementById('provisioning-pop')?.focus(); return; }
    const pop = readWiFiProvPoP(this.provisioningPoP, this.requiresBlePoP);
    this.provisioningPoPVisible = false;
    this.selectedSoftApMode = 'sdk-managed';
    const generation = this.generation;
    this.phase = 'selecting';
    this.statusMessage = `正在选择 ${device.name}…`;
    try {
      if (!await this.stopBleScan() || !this.current(generation) || this.phase !== 'selecting') return;
      this.selectionStarting = WiFiProv.selectDevice({
        id: device.id,
        security: this.usesRekeyPilot ? 1 : this.security,
        ...(pop === undefined ? {} : { pop }),
      });
      const selected = await this.selectionStarting;
      if (!this.current(generation)) return;
      this.selectedDevice = selected;
      await this.connectSession(undefined, pop);
    } catch (error) {
      if (this.current(generation)) this.setError(this.errorMessage(error, '选择配网设备失败'));
    }
  }

  async connectFirstInstallSoftAp(): Promise<void> {
    await this.connectSoftAp('system-connected', 'blinker-first-install');
  }

  async connectWifiReconfigureSoftAp(): Promise<void> {
    await this.connectSoftAp('system-connected', 'blinker-wifi-reconfigure');
  }

  validateProvisioningPoP(required = false): void {
    try { readWiFiProvPoP(this.provisioningPoP, required); this.provisioningPoPError = ''; }
    catch { this.provisioningPoPError = required ? '请输入固件提供的配网码（1～64 字节），不是热点密码。'
      : '配网码须为 1～64 字节且不含空字符；未配置的设备可留空。'; }
  }

  async connectSoftAp(mode: SoftApConnectionMode = 'sdk-managed', purpose?: SoftApPurpose): Promise<void> {
    if (this.usesRekeyPilot) return;
    const wifiReconfigure = purpose === 'blinker-wifi-reconfigure';
    if ((!this.canOperate && !(wifiReconfigure && this.canBeginWifiReconfigure))
      || this.operationBusy || this.isScanning || this.sessionReady) return;
    if (!this.deviceName.trim()) {
      await this.showToast('请输入 ESP32 临时热点名称');
      return;
    }
    if (mode !== 'sdk-managed' && mode !== 'system-connected') return;
    if (purpose !== undefined && (mode !== 'system-connected'
      || (purpose !== 'blinker-first-install' && purpose !== 'blinker-wifi-reconfigure'))) return;
    const firstInstall = purpose === 'blinker-first-install';
    const manualWrite = firstInstall || wifiReconfigure;
    let pop: string | undefined;
    if (manualWrite) {
      if (firstInstall ? !this.canUseFirstInstall || this.phase !== 'idle' : !this.canBeginWifiReconfigure) return;
      this.validateProvisioningPoP(true);
      if (this.provisioningPoPError) { document.getElementById('provisioning-pop')?.focus(); return; }
      pop = readWiFiProvPoP(this.provisioningPoP, true);
      if (typeof WiFiProv.readBlinkerConfigInfo !== 'function'
        || (firstInstall && (typeof WiFiProv.bootstrapBlinkerAccess !== 'function' || typeof WiFiProv.provisionBlinkerWifi !== 'function'))
        || (wifiReconfigure && typeof WiFiProv.provisionBlinkerWifiOnly !== 'function')) {
        this.setError(firstInstall ? '需要支持首次接入的匹配 Android App' : '需要支持保留身份重配的匹配 Android App'); return;
      }
    } else if (mode === 'sdk-managed') {
      this.validateProvisioningPoP();
      if (this.provisioningPoPError) { document.getElementById('provisioning-pop')?.focus(); return; }
      pop = readWiFiProvPoP(this.provisioningPoP);
    }
    const manual = mode === 'system-connected';
    if (manual) {
      if ((this.reconfiguring && !wifiReconfigure) || (this.phase !== 'idle' && !wifiReconfigure)) return;
      try { assertSystemConnectedReadOnly(this.capabilities); }
      catch (error) { this.setError(this.errorMessage(error, '手动只读连接不可用')); return; }
    }
    let generation = this.generation;
    const name = manual ? this.deviceName : this.deviceName.trim();
    const softApPassword = manual ? undefined : this.softApPassword || undefined;
    const preparation = {};
    this.manualPreparation = preparation;
    this.manualPreparing = manual;
    try {
      const requestedAccount = manual ? captureDeviceV2AccountContext(this.dataService, API.BASE_URL) : undefined;
      if (manual) {
        // Explicit action only: retire the old worker before new generation.
        const previous = generation;
        // The user may already be on an Internet-less AP. Reuse this prior
        // owner context only to begin Local reads, never as write authority.
        // Fresh Cloud/Admin/CAS checks still follow proven owner death.
        await this.restartPage(wifiReconfigure ? { account: requestedAccount!, identity: allocationContext(this.reconfigureContext!) } : undefined);
        generation = this.generation;
        if (generation !== previous + 1 || !this.canOperate || this.phase !== 'idle') return;
        assertDeviceV2AccountContext(this.dataService, requestedAccount!);
        if (requestedAccount!.authority !== API.BASE_URL) throw new Error('配网服务已变化，请手动重新开始');
      }
      this.selectedSoftApMode = mode;
      this.firstInstallRequested = firstInstall;
      this.wifiReconfigureRequested = wifiReconfigure;
      // startOver refreshes native capabilities; a stale UI offer is not permission to create.
      if (firstInstall && !this.canUseFirstInstall) throw new Error('需要支持首次接入的匹配 Android App');
      if (wifiReconfigure && !this.canUseWifiReconfigure) throw new Error('需要支持保留身份重配的匹配 Android App');
      if (this.readOnlySoftAp) assertSystemConnectedReadOnly(this.capabilities);
      const expected = this.currentAccount();
      await this.ensurePermissions('softap', mode);
      if (!this.current(generation)) return;
      this.checkAccount(expected);
      this.phase = 'selecting';
      this.statusMessage = '正在创建 SoftAP 配网设备…';
      const spec = {
        name,
        transport: 'softap' as const,
        security: this.security,
        softApPassword,
        ...(pop === undefined ? {} : { pop }),
        ...(manualWrite ? { softApPurpose: purpose } : {}),
      } as const;
      this.softApSpec = spec;
      const lease = this.enterSoftApLocal();
      this.selectionStarting = WiFiProv.createDevice(spec).then(selected => {
        this.rememberSoftApOwner(lease, selected); return selected;
      });
      const selected = await this.selectionStarting;
      if (!this.current(generation)) return;
      this.checkAccount(expected);
      this.selectedDevice = selected;
      if (this.manualPreparation === preparation) this.manualPreparing = false; // Selecting/connecting owns busy now.
      await this.connectSession(expected);
    } catch (error) {
      if (this.current(generation)) {
        this.setError(this.errorMessage(error, 'SoftAP 连接失败'));
        if (manualWrite) this.suspendPage(this.statusMessage);
        else this.clearProvisioningPoP();
      }
    } finally {
      if (this.manualPreparation === preparation) {
        this.manualPreparing = false; this.manualPreparation = undefined;
      }
    }
  }

  async scanWifiNetworks(): Promise<void> {
    if (!this.canOperate || !this.sessionReady || this.operationBusy || this.isScanning) return;
    const generation = this.generation;
    this.scanningNetworks = true;
    this.statusMessage = '正在让 ESP32 扫描附近 Wi-Fi…';
    try {
      const response = await this.localStep(() => WiFiProv.scanWifiNetworks());
      if (!this.current(generation)) return;
      this.networks = [...response.networks].sort((a, b) => b.rssi - a.rssi);
      this.statusMessage = this.networks.length
        ? `ESP32 发现 ${this.networks.length} 个 Wi-Fi 网络`
        : this.readOnlySoftAp ? 'ESP32 未返回 Wi-Fi 扫描结果' : 'ESP32 未返回 Wi-Fi 列表，也可以手动输入 SSID';
    } catch (error) {
      if (!this.current(generation)) return;
      if (this.readOnlySoftAp) {
        this.suspendPage(this.errorMessage(error, '只读扫描未完成，请检查热点连接后手动重新开始'));
        return;
      }
      if (this.softApStages?.state === 'failed' || this.softApStages?.state === 'cancelled') {
        this.setError(this.errorMessage(error, '配网会话无法确认，请手动重新开始；不会自动重试。'));
        return;
      }
      this.statusMessage = '设备不支持 Wi-Fi 扫描，请手动输入 SSID';
      await this.showToast(this.errorMessage(error, this.statusMessage));
    } finally {
      if (this.current(generation)) { this.scanningNetworks = false; this.cdr.detectChanges(); }
    }
  }

  selectNetwork(network: WifiNetwork): void {
    if (this.readOnlySoftAp || !this.canOperate || this.operationBusy) return;
    this.ssid = network.ssid;
  }

  async provision(): Promise<void> {
    if (!this.canProvision) return;
    if (this.usesRekeyPilot) { await this.provisionRekeyPilot(); return; }
    const generation = this.generation;
    this.provisioningGeneration = generation;
    this.provisionTransport = this.selectedDevice?.transport;
    this.persistNetwork();
    this.phase = 'provisioning';
    this.progress = 10;
    this.result = undefined;
    this.statusMessage = '正在建立安全会话…';
    let wifiAttempt: UnknownWiFiReceipt | undefined;
    let completionAttempt: CompletionAttempt | undefined;
    let invoked = false;
    let acceptedReceipt: WiFiProvOfficialReceipt | undefined;

    try {
      await this.installBlinkerIdentity();
      if (!this.current(generation)) return;
      const sealed = this.sealedInstall;
      if (sealed) await this.accountStep(() => this.allocationStore.markSealedWifiDispatched(sealed.instance, sealed.requestId, 'Development'));
      this.progress = 28;
      this.statusMessage = '设备身份已核对，正在发送 Wi-Fi 凭据…';
      const result = await this.accountStep(() => this.localStep<ProvisionResult>(() => {
        const options = { ssid: this.ssid, password: this.password || undefined };
        const identity = this.confirmedIdentityContext ?? this.reconfigureContext;
        if (!this.allocation || !identity) throw Error('WIFIPROV_COMPLETION_CONTEXT_REQUIRED');
        const { authority, accountId, sessionEpoch } = this.currentAccount();
        const checkpoint = { identity: Object.freeze(allocationContext(identity)),
          deviceInstanceId: this.allocation.deviceInstanceId.slice(), attemptedAt: Date.now() };
        const account = Object.freeze({ authority, accountId, sessionEpoch });
        completionAttempt = { ...checkpoint, account };
        this.completionAttempt = completionAttempt;
        wifiAttempt = { ...checkpoint, account, reader: new WiFiProvCloudReconciliation(checkpoint) };
        this.pendingWiFi = wifiAttempt; // Only public metadata from this actual invocation; never an old allocation.
        invoked = true;
        const work = this.manualWritableSoftAp ? this.requireManualWritePort().provision(options) : WiFiProv.provision(options);
        return work.then(async result => {
          // Record the exact native terminal before later lifecycle/Cloud guards.
          // They may discard UI publication, not turn a known result into UNKNOWN.
          acceptedReceipt = result.success ? 'confirmed' : 'rejected';
          if (this.pendingWiFi === wifiAttempt) this.pendingWiFi = undefined;
          if (sealed && result.success) {
            try { await this.accountStep(() => this.allocationStore.markSealedWifiConfirmed(sealed.instance, sealed.requestId, 'Development')); }
            catch { /* The exact native receipt stands; the durable fence remains. */ }
          }
          return result;
        });
      }, true));
      // The exact native terminal was accepted. Later Cloud waiting or route
      // teardown cannot downgrade that already known local result to UNKNOWN.
      if (this.pendingWiFi === wifiAttempt) this.pendingWiFi = undefined;
      this.result = result;
      this.clearProvisioningPoP();
      await this.confirmCompletion(result.success ? 'confirmed' : 'rejected', generation);
    } catch (error) {
      if (this.current(generation)) {
        if (acceptedReceipt) {
          try {
            if (!this.completionAttempt) throw Error('WIFIPROV_OPERATION_CANCELLED');
            assertDeviceV2AccountContext(this.dataService, this.completionAttempt.account);
            this.completion = wiFiProvCompletionResult(acceptedReceipt, 'unavailable', 'read-error');
            this.phase = 'error';
          } catch {
            this.completionAttempt = undefined; this.completion = undefined;
            this.setError('登录账号已变化，请重新进入配网页面。');
          }
        } else if (invoked && this.completionAttempt && (!this.manualWritableSoftAp || this.manualWritePort?.submittedWiFi)) {
          const rejection = explicitWiFiRejectionReason(error);
          if (rejection) {
            this.nativeWiFiFailureReason = rejection;
            if (this.pendingWiFi === wifiAttempt) this.pendingWiFi = undefined;
            this.statusMessage = this.errorMessage(error, '设备明确拒绝了 Wi-Fi 配置');
            await this.confirmCompletion('rejected', generation);
          } else {
            this.retainUnknownWiFi();
            await this.confirmCompletion('unknown', generation);
          }
        } else {
          if (this.pendingWiFi === wifiAttempt) this.pendingWiFi = undefined;
          this.completionAttempt = undefined;
          if (this.sealedInstallingGeneration === generation) {
            this.setError('设备接入结果尚未确认。可核对原请求；不会重发 Key 或 Wi-Fi。');
            try { await this.releasePlugin(); if (this.current(generation)) this.selectedDevice = undefined; }
            catch { this.closeFailed = true; }
            if (this.current(generation)) await this.loadSealedRecoveries();
          } else this.setError(this.errorMessage(error, 'Wi-Fi 配置未完成'));
          if (this.manualWritableSoftAp) {
            this.manualWritePort?.retire(); this.clearProvisioningPoP();
            void this.releasePlugin().catch(() => { this.closeFailed = true; });
          }
        }
      }
    } finally {
      if (this.pendingWiFi === wifiAttempt) this.pendingWiFi = undefined;
      if (this.generation === generation) this.clearProvisioningPoP();
      if (this.provisioningGeneration === generation) this.provisioningGeneration = undefined;
      if (this.sealedInstallingGeneration === generation) {
        this.sealedInstallingGeneration = undefined;
        this.sealedInstall = undefined;
      }
      if (this.current(generation)) this.cdr.detectChanges();
    }
    // Only this actual foreground invocation gets one automatic entry attempt.
    // Recovery reads never pass this point; cancellation retires its generation.
    // Keep navigation outside the WiFi catch so a route failure cannot retract
    // the confirmed receipt. The existing entry gate owns CAS/fence/click races.
    if (acceptedReceipt === 'confirmed' && completionAttempt && this.completionAttempt === completionAttempt
      && this.current(generation) && this.completion?.outcome === 'ready') {
      await this.openProvisionedDevice();
    }
  }

  private async provisionRekeyPilot(): Promise<void> {
    const previous = this.reconfigureContext, selected = this.selectedDevice;
    const operationId = environment.wifiProvRekeyPilotOperation;
    if (!this.rekeyPilotReady || !operationId || !previous || selected?.transport !== 'ble') return;
    const generation = this.generation;
    const options = { ssid: this.ssid, password: this.password || undefined };
    let credential: Awaited<ReturnType<CapacitorBleControllerCredentialStore['load']>>;
    let applyConfirmed = false;
    this.provisioningGeneration = generation;
    this.phase = 'provisioning'; this.progress = 10;
    this.statusMessage = '正在核对原设备和配网授权…';
    try {
      const account = this.currentAccount();
      const assertCurrent = () => {
        this.checkAccount(account);
        if (!this.rekeyPilotReady) throw Error('WIFIPROV_REKEY_CONTEXT_CHANGED');
      };
      const assertLocal = () => {
        assertCurrent();
        if (this.selectedDevice !== selected || !selected.connected) throw Error('WIFIPROV_REKEY_CONTEXT_CHANGED');
      };
      const journal = new CapacitorWiFiProvRekeyJournal(() => { assertCurrent(); return this.currentAccount(); });
      const info = decodeBlinkerConfigInfo(await this.accountStep(() => this.provisioningTransport.request(
        BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest())), true);
      assertLocal();
      if (!info.supportsRekey || !info.hasAccessState || !info.hasDeviceKey || !info.supportsAccessBootstrap) {
        this.setError('当前固件不支持安全换网及换 Key，未发送配置。请使用匹配的 BLE 固件。');
        return;
      }
      const management = this.managementPort('ble');
      await this.accountStep(() => this.assertProvisioningCloudNetwork());
      const resolved = (await this.accountStep(() => management.resolveDeviceInstanceV2(info.deviceInstanceId, 'cloud'))).data.device;
      if (!resolved || !sameAllocationContext(previous, allocationContext(resolved))) throw Error('WIFIPROV_REKEY_CONTEXT_CHANGED');
      const pending = await journal.load(previous.logicalDeviceId);
      const observed = { authority: account.authority, accountId: account.accountId, region: 'Development' as const,
        logicalDeviceId: previous.logicalDeviceId, operationId, deviceInstanceId: base64UrlEncode(info.deviceInstanceId),
        accessEpoch: info.accessEpoch, previous: { credentialVersion: previous.credentialVersion, locator: previous.locator } };
      if (pending && (pending.scope.operationId !== operationId || pending.scope.deviceInstanceId !== observed.deviceInstanceId
        || pending.scope.accessEpoch !== observed.accessEpoch || ![pending.scope.previous, pending.next].some(key =>
          key?.credentialVersion === previous.credentialVersion && key.locator === previous.locator))) {
        throw Error('WIFIPROV_REKEY_CONTEXT_CHANGED');
      }
      if (!pending || pending.phase === 'install-dispatched' || pending.phase === 'install-unknown') {
        await this.adminCoordinator(management).inspectExistingNetwork(previous, info);
        credential = await this.controllerCredentials.load(previous.logicalDeviceId);
        assertCurrent();
        if (!credential || credential.source !== 'wifiprov' || credential.state !== 'active' || credential.keyRotation
          || credential.registrationContext || credential.rootCredentialRef || credential.accessEpoch !== info.accessEpoch
          || credential.permissions !== 0x0f || !sameBytes(credential.deviceInstanceId, info.deviceInstanceId)
          || credential.cloudContext?.credentialVersion !== previous.credentialVersion || credential.cloudContext.locator !== previous.locator) {
          throw Error('WIFIPROV_REKEY_CONTEXT_CHANGED');
        }
      }
      const requireAdmin = () => {
        if (!credential) throw Error('WIFIPROV_REKEY_CONTEXT_CHANGED');
        return credential;
      };
      const scope = pending?.scope ?? observed;
      const gateway = new HttpWiFiProvRekeyGateway(API.BASE_URL,
        () => ({ accountId: this.dataService.auth?.uuid ?? '', region: getServiceRegion(), token: this.dataService.auth?.accessToken ?? '' }),
        this.cloudNetworkAbort.signal, assertCurrent);
      const coordinator = new WiFiProvRekeyCoordinator({ journal, gateway, assertCurrent,
        local: { transport: this.provisioningTransport, assertCurrent: assertLocal,
          authorize: binding => authorizeWiFiProvRekeySetup(this.provisioningTransport, binding, requireAdmin(), assertLocal),
          provision: async wifi => {
            assertLocal();
            this.progress = 75; this.statusMessage = '新 Key 已确认，正在下发一次 Wi-Fi 配置…';
            this.cdr.detectChanges();
            const result = await this.localStep<ProvisionResult>(() => WiFiProv.provision(wifi), true);
             applyConfirmed = result.success === true; // Exact native terminal of this one call, not a progress event.
            assertCurrent(); this.result = result; return result;
          } },
        onCommitted: async checkpoint => {
          const next = checkpoint.next!;
          const admin = requireAdmin();
          await this.controllerCredentials.recordWiFiProvRekey(scope.logicalDeviceId, {
            deviceInstanceId: scope.deviceInstanceId, accessEpoch: scope.accessEpoch, controllerId: base64UrlEncode(admin.controllerId),
            adminVersion: admin.credentialVersion, previous: scope.previous,
          }, next, assertCurrent);
          assertCurrent();
          this.rememberIdentity({ logicalDeviceId: scope.logicalDeviceId, accessEpoch: scope.accessEpoch, ...next }, info);
        }, explicitWiFiRejection: error => !!explicitWiFiRejectionReason(error),
      });
      const result = pending ? await coordinator.reconcile(scope) : await coordinator.start(scope, options);
      assertCurrent();
      const receipt = result.phase === 'wifi-accepted' ? 'confirmed' : result.phase === 'wifi-rejected' ? 'rejected' : 'unknown';
      this.completion = wiFiProvCompletionResult(receipt, 'unconfirmed');
      this.phase = 'error'; // Partial result never enters the device automatically.
       if (!pending && applyConfirmed && receipt === 'confirmed' && result.next && result.wifiDispatchedAt !== undefined) {
         // The matching device gates new-Key login on this Apply and the end
         // of its setup owner. The App still awaits its own native release,
         // checks the exact version/locator/instance, then reads Cloud only.
         this.provisionTransport = 'ble';
         this.completionAttempt = { identity: allocationContext({ logicalDeviceId: scope.logicalDeviceId, ...result.next }),
           deviceInstanceId: info.deviceInstanceId.slice(), attemptedAt: result.wifiDispatchedAt, account, rekey: true };
         await this.confirmCompletion('confirmed', generation);
       }
    } catch {
      if (this.current(generation)) this.setError('未完成安全重新配网。已提交的步骤不会自动重发，请核对原设备。');
    } finally {
      if (credential) clearBleControllerCredentialSecrets(credential);
      if (this.provisioningGeneration === generation) this.provisioningGeneration = undefined;
      if (this.current(generation)) {
        this.clearProvisioningPoP();
        try { await this.releasePlugin(); } catch { this.closeFailed = true; }
        if (this.current(generation)) { this.selectedDevice = undefined; this.cdr.detectChanges(); }
      }
    }
  }

  /** Only a read may be repeated explicitly; the result page has no WiFi write continuation. */
  async checkCompletionCloud(): Promise<void> {
    if (!this.canCheckCompletion) return;
    if (this.unknownWiFi) { await this.checkUnknownWiFiCloud(); return; }
    await this.confirmCompletion(this.completion!.officialReceipt, this.generation);
  }

  async openCompletionDevice(): Promise<void> {
    if (!this.canOpenCompletion) return;
    if (this.completion!.officialReceipt === 'unknown') await this.openUnknownWiFiDevice();
    else await this.openProvisionedDevice();
  }

  /** Leave a terminal result, not restart its identity or WiFi writes. */
  async returnToDeviceList(): Promise<void> {
    if (!this.canReturnToDeviceList) return;
    const generation = this.generation, completion = this.completion;
    this.completionOpening = true;
    this.completionActionMessage = '';
    this.cdr.detectChanges();
    try {
      if (await this.navController.navigateRoot('/home/device') === false) throw Error('WIFIPROV_NAVIGATION_CANCELLED');
    } catch {
      if (this.current(generation) && this.completion === completion) {
        this.completionActionMessage = '暂无法返回设备列表，请使用页面返回按钮；原配网记录仍保留。';
      }
    } finally {
      this.completionOpening = false;
      if (this.current(generation)) this.cdr.detectChanges();
    }
  }

  private async confirmCompletion(officialReceipt: WiFiProvOfficialReceipt, generation: number): Promise<void> {
    const attempt = this.completionAttempt;
    if (!attempt || !this.current(generation) || this.completionAbort) return;
    if (attempt.rekey && (officialReceipt !== 'confirmed' || !this.rekeyPilotReady)) return;
    const controller = new AbortController(); this.completionAbort = controller;
    this.completion = wiFiProvCompletionResult(officialReceipt, 'checking');
    this.progress = 90;
    this.statusMessage = officialReceipt === 'confirmed' ? 'Wi-Fi 已连接，正在确认设备可用' : '正在确认设备是否已上线';
    this.cdr.detectChanges();
    let closeConfirmed = false;
    const check = () => {
      if (controller.signal.aborted || !this.current(generation) || this.completionAttempt !== attempt
        || attempt.account.authority !== API.BASE_URL) throw Error('WIFIPROV_OPERATION_CANCELLED');
      assertDeviceV2AccountContext(this.dataService, attempt.account);
      if (attempt.rekey && !this.rekeyPilotReady) throw Error('WIFIPROV_KEY_CONTEXT_CHANGED');
      const context = this.confirmedIdentityContext ?? this.reconfigureContext;
      if (!context || !sameAllocationContext(context, attempt.identity)) throw Error('WIFIPROV_KEY_CONTEXT_CHANGED');
      if (closeConfirmed && wiFiProvCloudBoundary.blocked) throw Error('WIFIPROV_CLOUD_BOUNDARY_BUSY');
    };
    let observer: WiFiProvCloudObservation | undefined;
    try {
      if (officialReceipt === 'rejected') {
        // Preserve a precise device rejection even if local cleanup is uncertain.
        this.completion = wiFiProvCompletionResult(officialReceipt, 'unconfirmed');
        void this.releasePlugin().catch(() => { this.closeFailed = true; });
      } else {
        const result = await confirmWiFiProvCompletion(officialReceipt, {
          signal: controller.signal, assertCurrent: check,
          read: signal => (observer ??= new WiFiProvCloudObservation(attempt, attempt.rekey === true)).read({ signal, assertCurrent: check,
            closeLocal: async () => {
              try { await this.releasePlugin(); }
              catch { this.closeFailed = true; throw Error('WIFIPROV_CLOSE_UNCONFIRMED'); }
              if (this.softApCloudLease || wiFiProvCloudBoundary.blocked) throw Error('WIFIPROV_CLOSE_UNCONFIRMED');
              closeConfirmed = true;
            },
            assertCloud: () => this.assertProvisioningCloudNetwork(signal),
            read: (instance, expected, readSignal) => this.deviceManagement.readProvisioningCloudV2(instance, expected, readSignal),
          }),
        });
        check(); this.completion = result;
        if (result.cloud === 'blocked') this.recoveryBlocked = true;
        if (officialReceipt === 'unknown') this.wifiCloudState = result.cloud === 'blocked' ? 'error' : result.cloud;
      }
      check();
      this.phase = this.completion.outcome === 'ready' ? 'success' : 'error';
      this.progress = this.completion.outcome === 'ready' ? 100 : 90;
    } catch {
      // Discard another account's observation. A local CAS/fence change still
      // needs a terminal result instead of stranding the page in "checking".
      if (this.current(generation) && !controller.signal.aborted && this.completionAttempt === attempt) {
        try {
          assertDeviceV2AccountContext(this.dataService, attempt.account);
          this.completion = wiFiProvCompletionResult(officialReceipt, 'blocked', 'context-changed');
          this.recoveryBlocked = true; this.phase = 'error';
        } catch {
          this.completionAttempt = undefined; this.completion = undefined;
          this.setError('登录账号已变化，请重新进入配网页面。');
        }
      }
    } finally {
      if (this.completionAbort === controller) this.completionAbort = undefined;
      if (this.current(generation)) this.cdr.detectChanges();
    }
  }

  private cancelCompletion(): void {
    this.completionAbort?.abort(); this.completionAbort = undefined;
    if (this.completionChecking) {
      this.completion = wiFiProvCompletionResult(this.completion!.officialReceipt, 'unconfirmed', 'cancelled');
    }
  }

  async startOver(): Promise<void> { await this.restartPage(); }

  private async restartPage(localReadContext?: { account: DeviceV2AccountContext; identity: DeviceKeyContext }): Promise<void> {
    if (this.completion || this.unknownWiFi) return; // Result/recovery actions never reopen or replay a WiFi write.
    if (!this.current(this.generation) || this.localAcquisition || this.isProvisioning || this.scanningNetworks || this.phase === 'context') return;
    try { this.assertHandoffContext(); }
    catch { this.setError('原配网交接的账号或设备凭据上下文已变化，请退出后重新核对；不会重发。'); return; }
    const generation = ++this.generation;
    this.firstInstallPort?.retire();
    this.wifiReconfigurePort?.retire();
    this.clearProvisioningPoP();
    this.softApStages?.cancel();
    this.handoffWaiting = undefined;
    const completed = this.phase === 'success';
    this.clearScanTimer();
    try {
      // Drain an earlier close; only this explicit action may retry a failed one.
      if (this.pluginRelease) await this.pluginRelease.catch(() => {
        this.pluginRelease = undefined;
        this.stageClosing = undefined; // Explicit retry still requires native close proof.
      });
      await this.releasePlugin();
      if (!this.current(generation)) return;
      this.pluginRelease = undefined;
      this.closeFailed = false;
    } catch {
      this.closeFailed = true;
      if (this.current(generation)) this.setError('配网连接关闭尚未确认，请手动重新开始。');
      return;
    }
    this.selectedDevice = undefined;
    this.softApStages = undefined;
    this.softApSpec = undefined;
    this.selectedSoftApMode = 'sdk-managed';
    this.firstInstallRequested = false;
    this.firstInstallPort = undefined;
    this.wifiReconfigureRequested = false;
    this.wifiReconfigurePort = undefined;
    this.stageClosing = undefined;
    this.devices = [];
    this.networks = [];
    this.result = undefined;
    this.progress = 0;
    this.phase = 'idle';
    this.statusMessage = '选择配网方式并连接处于配网模式的 ESP32';
    if (completed) this.clearAllocation();
    this.cloudNetworkAbort = new AbortController();
    if (localReadContext) {
      assertDeviceV2AccountContext(this.dataService, localReadContext.account);
      if (localReadContext.account.authority !== API.BASE_URL || !this.reconfigureContextCurrent()
        || !sameAllocationContext(localReadContext.identity, this.reconfigureContext!)) throw Error('WIFIPROV_KEY_CONTEXT_CHANGED');
      this.currentAccount();
      this.reconfigureReady = true;
      this.initializing = this.initializePlugin(); // Native capabilities/listeners only, no Cloud on the AP.
    } else this.initializing = this.preparePage();
    await this.initializing;
    if (this.current(generation)) this.cdr.detectChanges();
  }

  toggleRemember(): void {
    if (this.readOnlySoftAp || !this.canOperate || this.operationBusy) return;
    this.rememberNetwork = !this.rememberNetwork;
    this.persistNetwork();
  }

  signalBars(rssi?: number): string {
    if (rssi === undefined) return 'fa-light fa-signal-bars-weak';
    if (rssi >= -55) return 'fa-light fa-signal-bars';
    if (rssi >= -72) return 'fa-light fa-signal-bars-fair';
    return 'fa-light fa-signal-bars-weak';
  }

  wifiSecurityLabel(security: number | string): string {
    const value = String(security).toLowerCase();
    return value === '0' || value.includes('open') ? '开放' : '加密';
  }

  private async connectSession(account?: ProvisionAccountContext, blePoP?: string): Promise<void> {
    const generation = this.generation;
    if (!this.canOperate) return;
    const transport = this.selectedDevice?.transport;
    let owner: ReturnType<typeof isolatedWiFiProvOwner> | undefined;
    if (transport === 'softap') {
      try { owner = isolatedWiFiProvOwner(this.selectedDevice); }
      catch { this.softApNetworkUnconfirmed = true; } // Older native builds stay fenced.
    }
    // Explicit first install is isolated-only; do not enter the legacy connect fallback.
    if (this.manualWritableSoftAp && !owner) throw new Error('WIFIPROV_ISOLATED_OWNER_REQUIRED');
    this.phase = 'connecting';
    this.statusMessage = '正在建立安全配网会话…';
    const expected = owner ? account ?? this.currentAccount() : undefined;
    const connect = () => WiFiProv.connect({
      softApPassword: transport === 'softap' && this.selectedSoftApMode !== 'system-connected'
        ? (this.softApSpec?.softApPassword ?? this.softApPassword) || undefined : undefined,
      ...(this.selectedSoftApMode === 'system-connected' ? { softApConnectionMode: 'system-connected' as const } : {}),
      ...(transport === 'softap' && this.softApSpec?.pop !== undefined ? { pop: this.softApSpec.pop } : {}),
      ...(transport === 'ble' && blePoP !== undefined ? { pop: blePoP } : {}),
    });
    const connected = owner ? await this.acquireSoftApConnection(owner, expected!, connect) : await connect();
    if (!this.current(generation)) return;
    if (owner) {
      if (isolatedWiFiProvOwner(connected).session !== owner.session) throw new Error('WIFIPROV_ISOLATED_OWNER_REQUIRED');
      this.checkAccount(expected!);
    }
    if (owner && this.firstInstallSoftAp) {
      this.firstInstallPort = new WiFiProvFirstInstallPort(WiFiProv, this.capabilities, connected, () => this.checkAccount(expected!));
    } else if (owner && this.wifiReconfigureSoftAp) {
      this.wifiReconfigurePort = new WiFiProvWifiReconfigurePort(WiFiProv, this.capabilities, connected, () => this.checkAccount(expected!));
    }
    if (owner && this.readOnlySoftAp && supportsSystemConnectedConfigInfo(this.capabilities)) {
      try {
        const info = await readSystemConnectedConfigInfo(WiFiProv, this.capabilities, connected,
          () => this.checkAccount(expected!));
        if (this.suspendedHandoff) {
          this.assertHandoffContext();
          assertWiFiProvSoftApHandoff(this.suspendedHandoff.checkpoint, owner, info);
        }
      } catch (error) {
        if (this.current(generation)) this.suspendPage(this.errorMessage(error, '设备状态未确认，请手动重新开始'));
        throw error;
      }
    }
    if (owner && !this.readOnlySoftAp) {
      this.softApStages = new WiFiProvSoftApStages(owner, {
        signal: this.cloudNetworkAbort.signal,
        assertCurrent: () => this.checkAccount(expected!),
        assertHandoffContext: () => this.checkAccountContext(expected!),
        assertCloud: () => this.assertProvisioningCloudNetwork(),
        close: () => this.closeStage(),
        reopen: () => this.reopenStage(expected!),
        waiting: stage => {
          if (!this.current(generation)) return;
          const previous = this.handoffWaiting;
          this.handoffWaiting = stage;
          if (stage) this.statusMessage = stage === 'cloud'
            ? '热点会话已关闭，请确认手机可访问互联网后继续。'
            : '下一步需重连原设备热点，核对设备后继续下发。';
          else if (previous) this.statusMessage = previous === 'cloud' ? '正在核对云端步骤…' : '正在重连并核对原设备…';
          this.cdr.detectChanges();
        },
      });
    }
    this.selectedDevice = connected;
    this.phase = 'ready';
    this.statusMessage = '设备已连接，可以选择目标 Wi-Fi';
    await this.scanWifiNetworks();
  }

  continueAcquisition(): void {
    if (this.canContinueAcquisition) this.localAcquisition?.continue();
  }

  cancelAcquisition(): void {
    if (this.localAcquisition) this.suspendPage('本次热点连接已取消；不会自动重试。');
  }

  private async acquireSoftApConnection(owner: ReturnType<typeof isolatedWiFiProvOwner>,
    expected: ProvisionAccountContext, connect: () => Promise<ProvisioningDevice>): Promise<ProvisioningDevice> {
    this.checkAccount(expected);
    if (this.localAcquisition) throw new Error('WIFIPROV_OPERATION_BUSY');
    const assertContext = () => this.checkAccountContext(expected);
    const acquisition = new WiFiProvSoftApAcquisition(owner, {
      signal: this.cloudNetworkAbort.signal,
      assertContext,
      assertForeground: () => this.checkAccount(expected),
      waiting: waiting => {
        if (this.destroyed || !this.viewActive || this.generation !== expected.generation) return;
        this.acquisitionWaiting = waiting;
        if (waiting) this.statusMessage = '热点已连接，请继续核对会话；不会自动发送 Wi-Fi 配置。';
        if (this.visibility.active.value) this.cdr.detectChanges();
      },
    });
    this.localAcquisition = acquisition;
    try { return await acquisition.run(connect, () => WiFiProv.getDeviceInfo()); }
    catch (error) {
      // Only the shared native close can retire the owner. No retry or ready fallback.
      void this.releasePlugin().catch(() => { this.closeFailed = true; });
      try {
        assertContext();
        // A failed result can arrive while the dialog still covers the WebView.
        // Retain display state only; foreground return neither retries nor clears close.
        this.phase = 'error'; this.statusMessage = this.errorMessage(error, '热点连接未完成，请手动重新开始。');
        if (this.visibility.active.value) this.cdr.detectChanges();
      } catch { /* A retired view/account must not receive this old result. */ }
      throw error;
    } finally {
      acquisition.cancel();
      if (this.localAcquisition === acquisition) {
        this.localAcquisition = undefined; this.acquisitionWaiting = false; this.pauseRetained = false;
      }
    }
  }

  continueHandoff(): void {
    if (this.current(this.generation) && this.handoffWaiting) this.softApStages?.continue();
  }

  cancelHandoff(): void {
    if (!this.handoffWaiting) return;
    this.softApStages?.cancel();
    this.manualWritePort?.retire(); this.clearProvisioningPoP();
    this.handoffWaiting = undefined;
    // Cancellation stops this run, not the original recovery journal or an ACK.
    if (this.result?.success) {
      this.phase = 'success';
      this.statusMessage = '设备已确认 Wi-Fi；云端核对已取消，请稍后从设备列表进入。';
    } else this.setError('本次配网已取消；已确认的身份和未确认请求会保留，不会自动重发。');
    void this.releasePlugin().catch(() => { this.closeFailed = true; });
  }

  private localStep<T>(work: () => Promise<T>, write = false): Promise<T> {
    if (write) assertProvisioningWritable(this.readOnlySoftAp);
    return this.softApStages ? this.softApStages.local(work, write) : work();
  }

  private closeStage(): Promise<void> {
    if (!this.stageClosing) {
      this.firstInstallPort?.retire();
      this.wifiReconfigurePort?.retire();
      const generation = this.generation;
      this.stageClosing = this.retireSoftApLocal().then(() => {
        if (this.current(generation) && this.selectedDevice) {
          this.selectedDevice = { ...this.selectedDevice, connected: false };
        }
      });
    }
    return this.stageClosing;
  }

  private async reopenStage(expected: ProvisionAccountContext) {
    assertProvisioningWritable(this.readOnlySoftAp);
    this.checkAccount(expected);
    if (!this.softApSpec) throw new Error('WIFIPROV_ISOLATED_OWNER_REQUIRED');
    await this.ensurePermissions('softap', this.selectedSoftApMode);
    this.checkAccount(expected);
    // The previous close was proven. New work needs its own close on cancellation.
    this.stageClosing = undefined;
    const lease = this.enterSoftApLocal();
    this.selectionStarting = WiFiProv.createDevice(this.softApSpec).then(selected => {
      this.rememberSoftApOwner(lease, selected); return selected;
    });
    const selected = await this.selectionStarting;
    this.checkAccount(expected);
    const owner = isolatedWiFiProvOwner(selected);
    const connected = await this.acquireSoftApConnection(owner, expected,
      () => WiFiProv.connect(this.manualWritableSoftAp
        ? { softApConnectionMode: 'system-connected', pop: this.softApSpec!.pop }
        : { softApPassword: this.softApSpec!.softApPassword,
          ...(this.softApSpec!.pop === undefined ? {} : { pop: this.softApSpec!.pop }) }));
    this.checkAccount(expected);
    if (isolatedWiFiProvOwner(connected).session !== owner.session) throw new Error('WIFIPROV_ISOLATED_OWNER_REQUIRED');
    if (this.firstInstallSoftAp) {
      this.firstInstallPort = new WiFiProvFirstInstallPort(WiFiProv, this.capabilities, connected, () => this.checkAccount(expected));
    } else if (this.wifiReconfigureSoftAp) {
      this.wifiReconfigurePort = new WiFiProvWifiReconfigurePort(WiFiProv, this.capabilities, connected, () => this.checkAccount(expected));
    }
    const raw = this.manualWritableSoftAp ? this.requireManualWritePort() : this.rawProvisioningTransport;
    const info = decodeBlinkerConfigInfo(await raw.request(
      BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest()));
    this.checkAccount(expected);
    this.selectedDevice = connected;
    this.phase = 'provisioning';
    return { owner, info };
  }

  private currentAccount(): ProvisionAccountContext {
    if (!this.current(this.generation)) throw new Error('配网页面已关闭');
    if (this.accountContext) {
      if (this.accountContext.authority !== API.BASE_URL) throw new Error('配网服务已变化，请重新进入页面');
      assertDeviceV2AccountContext(this.dataService, this.accountContext);
    }
    if (!this.accountContext || this.accountContext.generation !== this.generation) {
      this.accountContext = { ...captureDeviceV2AccountContext(this.dataService, API.BASE_URL), generation: this.generation };
    }
    assertDeviceV2AccountContext(this.dataService, this.accountContext);
    return this.accountContext;
  }

  private checkAccount(expected: ProvisionAccountContext): void {
    if (!this.visibility.active.value) throw new Error('配网事务已进入后台');
    this.checkAccountContext(expected);
  }

  private checkAccountContext(expected: ProvisionAccountContext): void {
    if (this.destroyed || !this.viewActive || this.generation !== expected.generation
      || this.accountContext !== expected || expected.authority !== API.BASE_URL) throw new Error('配网事务已结束');
    assertDeviceV2AccountContext(this.dataService, expected);
  }

  private captureHandoff(): SuspendedSoftApHandoff | undefined {
    if (this.readOnlySoftAp || this.result?.success || !this.accountContext || this.softApNetworkUnconfirmed) return;
    const checkpoint = this.softApStages?.captureHandoff();
    if (!checkpoint) return;
    try { this.checkAccountContext(this.accountContext); } catch { return; }
    const { authority, accountId, sessionEpoch } = this.accountContext;
    const identity = this.reconfigureContext ?? this.confirmedIdentityContext;
    return Object.freeze({ checkpoint, account: Object.freeze({ authority, accountId, sessionEpoch }),
      ...(identity ? { identity: Object.freeze({ logicalDeviceId: identity.logicalDeviceId,
        credentialVersion: identity.credentialVersion, locator: identity.locator }) } : {}) });
  }

  private assertHandoffContext(): void {
    const saved = this.suspendedHandoff;
    if (!saved) return;
    assertDeviceV2AccountContext(this.dataService, saved.account);
    if (saved.account.authority !== API.BASE_URL) throw new Error('WIFIPROV_HANDOFF_ACCOUNT_CHANGED');
    const identity = this.reconfigureContext ?? this.confirmedIdentityContext;
    if (saved.identity && (!identity || saved.identity.logicalDeviceId !== identity.logicalDeviceId
      || saved.identity.credentialVersion !== identity.credentialVersion || saved.identity.locator !== identity.locator)) {
      throw new Error('WIFIPROV_HANDOFF_CAS_CHANGED');
    }
  }

  private verifyHandoff(info: BlinkerConfigInfo): void {
    if (!this.suspendedHandoff) return;
    try {
      this.assertHandoffContext();
      this.checkAccount(this.currentAccount());
      consumeWiFiProvSoftApHandoff(this.suspendedHandoff.checkpoint, isolatedWiFiProvOwner(this.selectedDevice), info);
      this.suspendedHandoff = undefined;
    } catch (error) {
      this.softApStages?.cancel();
      void this.releasePlugin().catch(() => { this.closeFailed = true; });
      throw error;
    }
  }

  private enterSoftApLocal(): WiFiProvCloudLease {
    if (this.softApCloudLease) throw new Error('WIFIPROV_OPERATION_BUSY');
    this.softApIsolatedOwner = undefined;
    return this.softApCloudLease = wiFiProvCloudBoundary.enter();
  }

  private rememberSoftApOwner(lease: WiFiProvCloudLease, device: ProvisioningDevice): void {
    // A late create may supply cleanup correlation, never new UI/account work.
    if (this.softApCloudLease !== lease) return;
    try { this.softApIsolatedOwner = isolatedWiFiProvOwner(device); }
    catch { this.softApNetworkUnconfirmed = true; }
  }

  private async retireSoftApLocal(): Promise<void> {
    const lease = this.softApCloudLease;
    if (!lease) {
      if (wiFiProvCloudBoundary.blocked) throw new Error('WIFIPROV_CLOUD_BOUNDARY_BUSY');
      await WiFiProv.clearState(); return;
    }
    const owner = this.softApIsolatedOwner;
    await lease.retire(async () => {
      await WiFiProv.clearState();
      if (!owner || this.softApCloudLease !== lease || this.softApIsolatedOwner?.session !== owner.session) {
        throw new Error('WIFIPROV_CLOSE_UNCONFIRMED');
      }
      // An isolated worker's death cannot erase an older main-process hazard.
      // Cleanup uses its own bounded read; a cancelled UI signal is not proof.
      const attempted = await readWiFiProvSoftApAttempt(WiFiProv, new AbortController().signal);
      this.softApNetworkUnconfirmed = this.softApNetworkUnconfirmed || attempted;
      if (this.softApNetworkUnconfirmed) assertWiFiProvCloudTransport('softap');
    });
    if (this.softApCloudLease === lease) {
      this.softApCloudLease = undefined; this.softApIsolatedOwner = undefined;
    }
  }

  private async accountStep<T>(work: () => Promise<T>): Promise<T> {
    const expected = this.currentAccount();
    const value = await work();
    this.checkAccount(expected);
    return value;
  }

  private async assertProvisioningCloudNetwork(signal = this.cloudNetworkAbort.signal): Promise<void> {
    if (this.softApNetworkUnconfirmed) assertWiFiProvCloudTransport('softap');
    if (Capacitor.getPlatform() === 'android') {
      const attempted = await readWiFiProvSoftApAttempt(WiFiProv, signal);
      // A clear read cannot overwrite a local mark raised while awaiting native.
      this.softApNetworkUnconfirmed = this.softApNetworkUnconfirmed || attempted;
    }
    if (this.softApNetworkUnconfirmed) assertWiFiProvCloudTransport('softap');
  }

  private managementPort(transport: WiFiProvTransport | undefined): WiFiProvManagement {
    assertProvisioningWritable(this.readOnlySoftAp);
    const expected = this.currentAccount();
    const stages = transport === 'softap' ? this.softApStages : undefined;
    return protectedWiFiProvManagement(this.deviceManagement, transport, () => {
      this.checkAccount(expected);
      if (this.softApNetworkUnconfirmed) assertWiFiProvCloudTransport('softap');
    },
      () => this.assertProvisioningCloudNetwork(), stages ? work => stages.cloud(work) : undefined,
      (id, context) => invalidateKnownCredentialRoot(this.controllerCredentials, id,
        () => this.checkAccount(expected), context));
  }

  private adminCoordinator(management: WiFiProvManagement): WiFiProvAdmin {
    const expected = this.currentAccount();
    return new WiFiProvAdmin(this.controllerCredentials, management,
      this.provisioningTransport, () => this.checkAccount(expected));
  }

  private async installBlinkerIdentity(): Promise<void> {
    if (this.usesRekeyPilot) throw Error('WIFIPROV_REKEY_REQUIRES_PROTECTED_FLOW');
    assertProvisioningWritable(this.readOnlySoftAp);
    if (this.reconfigureTarget !== null && !this.reconfigureReady) {
      throw new Error('请先读取原设备的重新配网上下文');
    }
    const transport = this.selectedDevice?.transport;
    const management = this.managementPort(transport);
    const info = decodeBlinkerConfigInfo(await this.accountStep(() => this.provisioningTransport.request(
      BLINKER_CONFIG_ENDPOINT,
      encodeBlinkerConfigInfoRequest(),
    )));
    this.verifyHandoff(info); // Fresh public context before any identity API/intent/write.
    if (this.allocationStore.sealedInstallationsAvailable && getServiceRegion() === 'Development') {
      const pending = await this.accountStep(() => this.allocationStore.loadSealedInstallation(info.deviceInstanceId, 'Development'));
      if (pending && pending.phase !== 'wifi-confirmed') {
        this.sealedInstallingGeneration = this.generation;
        throw Error('WIFIPROV_SEALED_INSTALLATION_PENDING');
      }
    }
    if (this.sealedFirstInstallReady && transport === 'ble' && !this.allocation) {
      await this.installSealedIdentity(info, management);
      return;
    }
    if (info.hasAccessState && !info.hasDeviceKey) throw this.cloudRegistrationCapabilityRequired();
    let allocation = this.allocation;
    if (allocation && !sameBytes(allocation.deviceInstanceId, info.deviceInstanceId)) {
      throw new Error('当前配网事务属于另一台设备，请重新开始');
    }
    const isolatedSoftApReconfiguration = transport === 'softap' && !!this.softApStages
      && (this.selectedSoftApMode === 'sdk-managed' || this.wifiReconfigureSoftAp);
    if ((transport === 'ble' || isolatedSoftApReconfiguration) && this.reconfigureTarget !== null && this.reconfigureContext
      && info.supportsAccessBootstrap && info.hasDeviceKey && info.hasAccessState
      && (!allocation || allocation.networkOnlyReconfiguration)) {
      // An explicit network reset preserves the existing root. Do not resume a
      // historical allocation/Admin checkpoint or access DeviceKey merely to change WiFi.
      const expected = allocationContext(this.reconfigureContext);
      if (isolatedSoftApReconfiguration) await this.accountStep(() => this.softApStages!.prepareCloud());
      else await this.accountStep(() => this.assertProvisioningCloudNetwork());
      const resolved = (await this.accountStep(() => management.resolveDeviceInstanceV2(info.deviceInstanceId, 'cloud'))).data.device;
      if (!resolved || !sameAllocationContext(expected, allocationContext(resolved))) {
        throw new Error('扫描到的设备不是当前重新配网的原设备');
      }
      const identity = await this.adminCoordinator(management).inspectExistingNetwork(expected, info);
      this.rememberIdentity(identity, info);
      this.allocation!.networkOnlyReconfiguration = true;
      this.blinkerDeviceName = resolved.name;
      return;
    }
    if (allocation?.deviceKey === '') {
      if (!info.hasDeviceKey || (allocation.preserveAccess
        && (!info.hasAccessState || allocation.accessEpoch !== info.accessEpoch))) {
        throw new Error('设备接入根已变化，请停止当前配网事务');
      }
      return; // Confirmed identity: retry WiFi only, never Bootstrap again.
    }
    const isolatedAccess = transport === 'softap' && !!this.softApStages && info.supportsAccessBootstrap;
    if (isolatedAccess) {
      if (allocation) throw Object.assign(Error('WIFIPROV_IDENTITY_UNCONFIRMED'), { code: 'WIFIPROV_IDENTITY_UNCONFIRMED' });
      if (!info.hasAccessState && this.reconfigureContext) throw new Error('WIFIPROV_DEVICE_CONTEXT_CHANGED');
      const account = this.currentAccount();
      await assertWiFiProvWritePreflight(info, this.allocationStore, this.controllerCredentials,
        () => this.checkAccount(account));
    }
    // Reject before preparing any local Admin/rotation intent, not just before
    // HTTP. The confirmed-identity WiFi-only fast path above needs no Cloud.
    if (transport === 'softap' && this.softApStages) {
      await this.accountStep(() => this.softApStages!.prepareCloud());
    } else {
      await this.accountStep(() => this.assertProvisioningCloudNetwork());
      assertWiFiProvCloudTransport(transport);
    }
    const admin = this.adminCoordinator(management);
    if (isolatedAccess && !allocation && info.hasAccessState) {
      // Do not use resume(): a pending checkpoint can replay registration,
      // rotation or Bootstrap. This check has no device or Cloud write effect.
      const resolved = (await this.accountStep(() => management.resolveDeviceInstanceV2(info.deviceInstanceId, 'cloud'))).data.device;
      if (!resolved) throw new Error('WIFIPROV_ADMIN_CREDENTIAL_REQUIRED');
      const context = allocationContext(resolved);
      const expected = this.reconfigureContext ?? this.confirmedIdentityContext;
      if (expected && !sameAllocationContext(expected, context)) throw new Error('WIFIPROV_KEY_CONTEXT_CHANGED');
      this.rememberIdentity(await admin.inspectExisting(context, info), info);
      return;
    }
    if (!isolatedAccess && !allocation && !this.reconfiguring) {
      const expected = this.currentAccount();
      await new WiFiProvRetirement(this.allocationStore, this.controllerCredentials,
        management, () => this.checkAccount(expected)).recoverRemoved(info, async () => {
        const alert = await this.alertController.create({ header: '原设备已移除',
          message: '服务器已确认原设备被移除，当前设备接入信息也已重置。是否清理本机对应配网记录并重新添加？不会恢复旧设备或旧权限。',
          buttons: [{ text: '取消', role: 'cancel' }, { text: '清理并重新添加', role: 'confirm' }] });
        await alert.present();
        return (await alert.onDidDismiss()).role === 'confirm';
      });
    }
    if (!isolatedAccess && !allocation && info.supportsAccessBootstrap) {
      let checkpointId = this.reconfigureContext?.logicalDeviceId;
      const pendingId = (await this.accountStep(() => this.allocationStore.load(info.deviceInstanceId)))?.context?.logicalDeviceId;
      if (pendingId && checkpointId && pendingId !== checkpointId) throw new Error('WIFIPROV_ALLOCATION_CONFLICT');
      if (!checkpointId && info.hasAccessState) {
        // One physical instance may have retired test/reset identities. A live
        // root belongs to the current account-resolved device, not the first
        // cached WiFiProv record sharing its instance. Empty-root pending
        // recovery and explicit reconfiguration retain their original fences.
        const resolved = (await this.accountStep(() => management.resolveDeviceInstanceV2(
          info.deviceInstanceId, 'cloud',
        ))).data.device;
        // Bootstrap can precede the first cloud session/instance association.
        // A complete installed root may use the coordinator's unique native checkpoint;
        // lookup failures, ambiguous records and root/context mismatches still fail closed.
        if (!resolved && !info.hasDeviceKey) {
          throw new Error('设备已有接入身份，但当前账号没有对应记录；请恢复原账号或重置设备');
        }
        if (resolved && pendingId && resolved.logicalDeviceId !== pendingId) throw new Error('WIFIPROV_ALLOCATION_CONFLICT');
        checkpointId = resolved?.logicalDeviceId ?? pendingId;
      }
      checkpointId ??= pendingId;
      const recovered = await admin.resume(info, checkpointId);
      if (recovered) {
        this.rememberIdentity(recovered, info);
        return;
      }
      if (info.hasAccessState && !checkpointId) {
        throw new Error('设备已有接入身份，但当前账号没有对应记录；请恢复原账号或重置设备');
      }
    }
    if (!allocation && this.reconfiguring && info.hasDeviceKey) {
      this.allocation = await this.resumeExistingIdentity(info, management);
      return;
    }
    if (!allocation) {
      if (info.hasAccessState) {
        if (this.reconfiguring) {
          throw new Error(
            '设备接入权限仍存在但 DeviceKey 已清除；请完成接入重置后重试',
          );
        }
        throw this.cloudRegistrationCapabilityRequired();
      } else if (info.hasDeviceKey) {
        throw new Error(this.reconfiguring
          ? '设备身份状态与重新配网上下文不一致，请返回设备页面重试'
          : '设备已有身份，请从原设备页面发起重新配网');
      } else {
        if (!this.reconfigureContext) {
          const resolved = (await this.accountStep(() => management.resolveDeviceInstanceV2(
            info.deviceInstanceId, 'cloud',
          ))).data.device;
          if (!resolved && (await this.accountStep(() => management.resolveDeviceInstanceV2(
            info.deviceInstanceId, 'ble_direct',
          ))).data.device) throw this.cloudRegistrationCapabilityRequired();
          if (isolatedAccess && resolved) throw new Error('WIFIPROV_DEVICE_CONTEXT_CHANGED');
          if (resolved) {
            const confirmed = await this.accountStep(() => this.confirmExistingDevice(resolved.name));
            if (!confirmed) throw new Error('已取消覆盖原设备的重新配网');
            if (!resolved.credentialVersion || !resolved.locator) {
              throw new Error('原设备尚无云凭据，请先通过原设备的 BLE 接入记录恢复');
            }
            this.reconfigureContext = {
              logicalDeviceId: resolved.logicalDeviceId,
              credentialVersion: resolved.credentialVersion,
              locator: resolved.locator,
            };
            this.blinkerDeviceName = resolved.name;
          }
        }
        if (this.reconfigureContext && info.supportsAccessBootstrap) {
          this.rememberIdentity(await admin.reconfigure(this.reconfigureContext, info), info);
          return;
        }
        const identity = this.reconfigureContext
          ? (await this.accountStep(() => management.rotateDeviceKeyV2(
              this.reconfigureContext!,
              this.rotationRequestId(),
            ))).data
          : await this.createDeviceIdentity(info.deviceInstanceId, management, isolatedAccess);
        this.confirmedIdentityContext = { logicalDeviceId: identity.logicalDeviceId,
          credentialVersion: identity.credentialVersion, locator: identity.locator };
        if (this.reconfigureContext) {
          this.reconfigureContext = {
            logicalDeviceId: identity.logicalDeviceId,
            credentialVersion: identity.credentialVersion,
            locator: identity.locator,
          };
        }
        const base = {
          logicalDeviceId: identity.logicalDeviceId,
          deviceKey: identity.deviceKey,
          deviceInstanceId: info.deviceInstanceId.slice(),
          accessEpoch: 1,
          preserveAccess: false as const,
        };
        allocation = info.supportsAccessBootstrap
          ? {
              ...base,
              directBootstrap: true,
              credentialVersion: identity.credentialVersion,
              locator: identity.locator,
            }
          : {
              ...base,
              credentialStored: true,
            };
        this.allocation = allocation;
      }
    }

    if (isBootstrapAllocation(allocation)) {
      await admin.install(allocation, info);
      this.allocation = { logicalDeviceId: allocation.logicalDeviceId, deviceKey: '',
        deviceInstanceId: allocation.deviceInstanceId, accessEpoch: allocation.accessEpoch,
        preserveAccess: true, credentialStored: true };
      return;
    }
    const configured = await this.accountStep(() => configureBlinkerAccess(
      this.provisioningTransport,
      allocation.deviceKey,
      undefined,
      info,
    ));
    // A Cloud-only product must not inherit old local Direct credentials.
    if (!allocation.preserveAccess && configured.operation === BlinkerConfigOperation.Install) {
      await this.accountStep(() => this.controllerCredentials.remove(allocation.logicalDeviceId));
    }
  }

  private async installSealedIdentity(info: BlinkerConfigInfo, management: WiFiProvManagement): Promise<void> {
    const selected = this.selectedDevice, account = this.currentAccount();
    const assertCurrent = () => {
      this.checkAccount(account);
      if (!this.sealedFirstInstallReady || this.selectedDevice !== selected || !selected?.connected || selected.transport !== 'ble'
        || selected.security !== 1) throw Error('WIFIPROV_SEALED_SETUP_CHANGED');
    };
    assertCurrent();
    readWiFiProvPoP(this.provisioningPoP, true);
    if (info.hasAccessState || info.hasDeviceKey || info.accessEpoch !== 0 || !info.supportsAccessBootstrap) {
      throw Error('设备已有身份或不支持首次接入，请从原设备页面继续。');
    }
    if (!this.allocationStore.sealedInstallationsAvailable) throw Error('当前 App 不支持安全首装记录，未发送配置。');
    await this.assertProvisioningCloudNetwork();
    assertCurrent();
    if (await this.allocationStore.load(info.deviceInstanceId)) throw Error('存在旧配网记录，请先核对原设备。');
    assertCurrent();
    const cloud = (await management.resolveDeviceInstanceV2(info.deviceInstanceId, 'cloud')).data.device;
    if (cloud || (await management.resolveDeviceInstanceV2(info.deviceInstanceId, 'ble_direct')).data.device) {
      throw Error('设备已有接入记录，请从原设备页面继续。');
    }
    this.sealedInstallingGeneration = this.generation;
    const material = await createFreshSealed(info.deviceInstanceId, this.blinkerDeviceName, this.allocationStore, {
      createDeviceForWiFiProvInstallV2: (...args) => this.deviceManagement.createDeviceForWiFiProvInstallV2(...args),
    }, assertCurrent, 'Development', this.cloudNetworkAbort.signal);
    const pending = await this.allocationStore.loadSealedInstallation(info.deviceInstanceId, 'Development');
    assertCurrent();
    if (pending?.phase !== 'card-confirmed' || pending.requestId !== material.requestId
      || !pending.context || !sameAllocationContext(pending.context, allocationContext(material))) {
      throw Error('WIFIPROV_SEALED_INSTALLATION_CHANGED');
    }
    const instance = info.deviceInstanceId.slice(), requestId = pending.requestId;
    const admin = new WiFiProvAdmin(this.controllerCredentials, management, this.provisioningTransport, assertCurrent);
    await admin.install(material, info, () => this.allocationStore.markSealedBootstrapDispatched(instance, requestId, 'Development'));
    await this.allocationStore.markSealedBootstrapAccepted(instance, requestId, 'Development');
    assertCurrent();
    this.sealedInstall = { instance, requestId };
    this.rememberIdentity({ ...allocationContext(material), accessEpoch: 1 }, info);
  }

  private rememberIdentity(identity: WiFiProvIdentity, info: BlinkerConfigInfo): void {
    this.reconfigureContext = { logicalDeviceId: identity.logicalDeviceId,
      credentialVersion: identity.credentialVersion, locator: identity.locator };
    this.confirmedIdentityContext = { ...this.reconfigureContext };
    this.allocation = { logicalDeviceId: identity.logicalDeviceId, deviceKey: '',
      deviceInstanceId: info.deviceInstanceId.slice(), accessEpoch: identity.accessEpoch,
      preserveAccess: true, credentialStored: true };
  }

  private async resumeExistingIdentity(
    info: BlinkerConfigInfo, management: WiFiProvManagement,
  ): Promise<DeviceAllocation> {
    const expected = this.reconfigureContext!;
    const resolved = (await this.accountStep(() => management.resolveDeviceInstanceV2(
      info.deviceInstanceId, 'cloud',
    ))).data.device;
    if (!resolved
      || resolved.logicalDeviceId !== expected.logicalDeviceId
      || resolved.credentialVersion !== expected.credentialVersion
      || resolved.locator !== expected.locator) {
      throw new Error('扫描到的设备不是当前重新配网的原设备');
    }

    if (info.hasAccessState) {
      const account = this.currentAccount();
      const credential = await this.controllerCredentials.load(expected.logicalDeviceId);
      if (!credential) {
        throw new Error('本机缺少该设备的 BLE 控制凭据；请先恢复控制权或执行接入重置');
      }
      try {
        this.checkAccount(account);
        if (credential.state !== 'active'
          || !sameBytes(credential.deviceInstanceId, info.deviceInstanceId)
          || credential.accessEpoch !== info.accessEpoch) {
          throw new Error('本机 BLE 控制凭据与设备身份不一致；请先恢复控制权或执行接入重置');
        }
      } finally {
        clearBleControllerCredentialSecrets(credential);
      }
    }

    this.blinkerDeviceName = resolved.name;
    const allocation = {
      logicalDeviceId: resolved.logicalDeviceId,
      deviceKey: '',
      deviceInstanceId: info.deviceInstanceId.slice(),
      accessEpoch: info.accessEpoch,
      credentialStored: true as const,
    };
    return info.hasAccessState
      ? { ...allocation, preserveAccess: true }
      : { ...allocation, preserveAccess: false };
  }

  private cloudRegistrationCapabilityRequired(): Error {
    return Object.assign(Error('新增 Wi-Fi 产品需要独立注册及任务存储校验，当前尚未支持；不会改写原 BLE 设备。'),
      { code: 'ACCESS_REGISTRATION_CAPABILITY_REQUIRED' });
  }

  private async createDeviceIdentity(instance: Uint8Array, management: WiFiProvManagement, freshOnly = false): Promise<DeviceKeyContext & { deviceKey: string }> {
    const expected = this.currentAccount();
    const allocation = new WiFiProvAllocation(this.allocationStore, management, () => this.checkAccount(expected));
    return freshOnly ? allocation.createNew(instance, this.blinkerDeviceName) : allocation.create(instance, this.blinkerDeviceName);
  }

  private rotationRequestId(): string {
    // Cloud-only rotation is separate from the durable first-allocation journal.
    this.rotationIdempotencyKey ||= `wifiprov-${hex(randomBytes(16))}`;
    return this.rotationIdempotencyKey;
  }

  private async confirmExistingDevice(name: string): Promise<boolean> {
    const alert = await this.alertController.create({
      header: '发现已添加的设备',
      message: `“${name}”已属于当前账号。继续会保留原控制页面并更新网络与接入凭据。`,
      buttons: [
        { text: '取消', role: 'cancel' },
        { text: '继续重新配置', role: 'confirm' },
      ],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === 'confirm';
  }

  private clearAllocation(): void {
    this.cancelWiFiCloudRead();
    this.pendingWiFi = undefined;
    this.unknownWiFi = undefined;
    this.unknownRecoveries = []; this.unknownHintsAccount = undefined;
    this.sealedReadAbort?.abort(); this.sealedRecoveries = []; this.sealedHintsAccount = undefined;
    this.sealedRecoveryMessage = ''; this.sealedInstall = undefined;
    if (this.allocation) this.allocation.deviceKey = '';
    this.allocation = undefined;
    this.rotationIdempotencyKey = '';
    this.accountContext = undefined;
    this.confirmedIdentityContext = undefined;
    this.suspendedHandoff = undefined;
  }

  private get manualWritePort(): WiFiProvFirstInstallPort | WiFiProvWifiReconfigurePort | undefined {
    return this.wifiReconfigureSoftAp ? this.wifiReconfigurePort : this.firstInstallPort;
  }

  private requireManualWritePort(): WiFiProvFirstInstallPort | WiFiProvWifiReconfigurePort {
    if (!this.manualWritableSoftAp || !this.manualWritePort) throw new Error('WIFIPROV_MANUAL_WRITE_REQUIRED');
    return this.manualWritePort;
  }

  /** Explicit owner-only read; does not continue the failed stage coordinator. */
  async checkUnknownWiFiCloud(): Promise<void> {
    if (!this.canCheckWiFiCloud) return;
    const receipt = this.unknownWiFi!, generation = this.generation;
    const controller = new AbortController();
    this.wifiCloudAbort = controller;
    this.wifiCloudState = 'checking';
    this.completion = wiFiProvCompletionResult('unknown', 'checking');
    let closeConfirmed = false;
    const check = () => {
      if (controller.signal.aborted || !this.current(generation) || this.unknownWiFi !== receipt
        || receipt.account.authority !== API.BASE_URL) throw new Error('WIFIPROV_OPERATION_CANCELLED');
      assertDeviceV2AccountContext(this.dataService, receipt.account);
      if (this.unknownAvailability(receipt) !== 'available') throw new Error('WIFIPROV_CHECKPOINT_EXPIRED');
      if (closeConfirmed && wiFiProvCloudBoundary.blocked) throw new Error('WIFIPROV_CLOUD_BOUNDARY_BUSY');
      if (!this.confirmedIdentityContext || !sameAllocationContext(this.confirmedIdentityContext, receipt.identity)) {
        throw new Error('WIFIPROV_KEY_CONTEXT_CHANGED');
      }
    };
    const deadline = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await receipt.reader.read({ signal: controller.signal, assertCurrent: check,
        closeLocal: async () => {
          await this.releasePlugin();
          if (this.softApCloudLease || wiFiProvCloudBoundary.blocked) throw new Error('WIFIPROV_CLOSE_UNCONFIRMED');
          closeConfirmed = true;
        },
        assertCloud: () => this.assertProvisioningCloudNetwork(controller.signal),
        read: async (instance, expected, signal) => {
          if (receipt.recovery) await this.assertRecoveryRecord(receipt.recovery, signal);
          check();
          const result = await this.deviceManagement.readProvisioningCloudV2(instance, expected, signal);
          if (receipt.recovery) await this.assertRecoveryRecord(receipt.recovery, signal);
          check(); return result;
        },
      });
      check(); this.wifiCloudState = result;
      this.completion = wiFiProvCompletionResult('unknown', result);
      this.phase = result === 'online' ? 'success' : 'error';
      this.progress = result === 'online' ? 100 : 90;
    } catch (error) {
      if (this.current(generation) && this.unknownWiFi === receipt && this.wifiCloudAbort === controller) {
        this.wifiCloudState = 'error';
        if (isUnknownRecoveryInvalid(error)) this.recoveryBlocked = true;
        this.completion = wiFiProvCompletionResult('unknown', this.recoveryBlocked ? 'blocked' : 'unavailable',
          this.recoveryBlocked ? 'context-changed' : controller.signal.aborted ? 'timeout' : 'read-error');
      }
    } finally {
      clearTimeout(deadline);
      if (this.wifiCloudAbort === controller) this.wifiCloudAbort = undefined;
      if (this.current(generation)) this.cdr.detectChanges();
    }
  }

  async openUnknownWiFiDevice(): Promise<void> {
    const receipt = this.unknownWiFi;
    if (!receipt || this.wifiCloudState !== 'online' || !this.canOpenCompletion) return;
    assertDeviceV2AccountContext(this.dataService, receipt.account);
    if (receipt.account.authority !== API.BASE_URL || !this.confirmedIdentityContext
      || !sameAllocationContext(this.confirmedIdentityContext, receipt.identity)) return;
    // User navigation only: no Direct handoff, journal completion or provisioning retry.
    this.completionOpening = true;
    this.completionActionMessage = '';
    try { await this.navController.navigateRoot(`/device/${encodeURIComponent(receipt.identity.logicalDeviceId)}`); }
    catch { if (this.current(this.generation)) this.completionActionMessage = '设备已上线，暂无法打开设备页面，请稍后从设备列表进入。'; }
    finally { this.completionOpening = false; if (this.current(this.generation)) this.cdr.detectChanges(); }
  }

  private cancelWiFiCloudRead(): void {
    this.wifiCloudAbort?.abort(); this.wifiCloudAbort = undefined;
    this.wifiCloudState = 'idle';
  }

  private retainUnknownWiFi(): void {
    // retire()/generation changes must not erase evidence of an already invoked
    // WiFi call. Before invocation, Bootstrap alone cannot create this receipt.
    if (!this.unknownWiFi && this.pendingWiFi) {
      this.unknownWiFi = this.pendingWiFi;
      this.wifiCloudState = 'idle';
      this.recoveryBlocked = false;
      if (!this.completion) this.completion = wiFiProvCompletionResult('unknown', 'unconfirmed', 'cancelled');
      // Only the existing typed first-install allocation can carry this durable
      // checkpoint. BLE/legacy attempts stay in memory; never invent a journal.
      if (this.firstInstallPort?.submittedWiFi) this.persistUnknownWiFi(this.pendingWiFi);
    }
  }

  private unknownAvailability(receipt: WiFiProvUnknownWiFiReceipt): 'available' | 'expired' | 'clock-invalid' {
    return wiFiProvUnknownAvailability(createWiFiProvUnknownCheckpoint(receipt.attemptedAt), Date.now());
  }

  /** Save only a real UNKNOWN, not an allocation/Bootstrap or pre-submit intent. */
  private persistUnknownWiFi(receipt: UnknownWiFiReceipt): void {
    this.wifiCheckpointState = 'saving';
    const controller = new AbortController(), deadline = setTimeout(() => controller.abort(), 5000);
    const task: Promise<void> = (async () => {
      assertDeviceV2AccountContext(this.dataService, receipt.account);
      if (receipt.account.authority !== API.BASE_URL) throw Error('WIFIPROV_CHECKPOINT_NOT_CURRENT');
      const saved = await unknownLocalStep(controller.signal,
        () => this.allocationStore.saveUnknown(receipt.deviceInstanceId, receipt.identity, receipt.attemptedAt));
      assertDeviceV2AccountContext(this.dataService, receipt.account);
      receipt.recovery = saved;
      if (this.unknownWiFi === receipt) {
        this.wifiCheckpointState = 'saved'; this.unknownHintsAccount = receipt.account;
        this.unknownRecoveries = [...this.unknownRecoveries.filter(entry => entry.requestId !== saved.requestId), saved];
      }
    })().catch(() => {
      // A lost storage terminal is not permission to resend or retry saving.
      if (this.unknownWiFi === receipt) this.wifiCheckpointState = 'unconfirmed';
    }).finally(() => {
      clearTimeout(deadline);
      if (this.checkpointSaving === task) this.checkpointSaving = undefined;
      if (this.current(this.generation)) this.cdr.detectChanges();
    });
    this.checkpointSaving = task;
  }

  private async loadUnknownRecoveries(): Promise<void> {
    if (!this.nativeSupported || typeof this.allocationStore.listUnknown !== 'function') return;
    const generation = this.generation, authority = API.BASE_URL, controller = new AbortController();
    this.unknownHintsAbort = controller; this.unknownRecoveryLoading = true; this.unknownRecoveryError = '';
    const deadline = setTimeout(() => controller.abort(), 15000);
    const check = (account: DeviceV2AccountContext) => {
      if (!this.current(generation) || controller.signal.aborted || authority !== API.BASE_URL) throw Error('WIFIPROV_OPERATION_CANCELLED');
      assertDeviceV2AccountContext(this.dataService, account);
    };
    try {
      const account = await waitForWiFiProvAccount(this.dataService, authority, controller.signal);
      check(account); this.unknownHintsAccount = account;
      const entries = await unknownLocalStep(controller.signal, () => this.allocationStore.listUnknown());
      check(account); this.unknownRecoveries = entries;
    } catch {
      if (this.current(generation)) this.unknownRecoveryError = '暂无法读取配网核对记录；可手动重新读取。';
    } finally {
      clearTimeout(deadline);
      if (this.unknownHintsAbort === controller) this.unknownHintsAbort = undefined;
      this.unknownRecoveryLoading = false;
      if (this.current(generation)) this.cdr.detectChanges();
    }
  }

  private async loadSealedRecoveries(): Promise<void> {
    if (!this.allocationStore.sealedInstallationsAvailable || getServiceRegion() !== 'Development' || this.sealedReadAbort) return;
    const generation = this.generation, stop = new AbortController();
    this.sealedReadAbort = stop;
    const deadline = setTimeout(() => stop.abort(), 5000);
    try {
      const account = await waitForWiFiProvAccount(this.dataService, API.BASE_URL, stop.signal);
      const entries = await unknownLocalStep(stop.signal, () => this.allocationStore.listSealedInstallations('Development'));
      if (this.current(generation) && !stop.signal.aborted && getServiceRegion() === 'Development') {
        assertDeviceV2AccountContext(this.dataService, account);
        this.sealedHintsAccount = account;
        this.sealedRecoveries = entries;
      }
    } catch {
      if (this.current(generation) && !stop.signal.aborted) this.sealedRecoveryMessage = '暂无法读取本机接入记录；可离开后重新进入。';
    } finally {
      clearTimeout(deadline);
      if (this.sealedReadAbort === stop) this.sealedReadAbort = undefined;
      if (this.current(generation)) this.cdr.detectChanges();
    }
  }

  canReconcileSealed(entry: WiFiProvSealedInstallation): boolean {
    return !!entry.recipientPublicKey && !!this.sealedHintsAccount && this.sealedRecoveries.includes(entry)
      && !this.sessionReady && !this.isScanning && !this.operationBusy && !this.sealedReadAbort && !this.closeFailed
      && !this.pluginRelease && !wiFiProvCloudBoundary.blocked && this.current(this.generation) && getServiceRegion() === 'Development';
  }

  async checkSealedInstallation(entry: WiFiProvSealedInstallation): Promise<void> {
    const account = this.sealedHintsAccount;
    if (!account || !this.canReconcileSealed(entry)) return;
    const generation = this.generation, stop = new AbortController();
    this.sealedReadAbort = stop; this.recoveryBusy = true; this.sealedRecoveryMessage = '正在核对原设备卡…';
    const deadline = setTimeout(() => stop.abort(), 10000);
    const assertCurrent = () => {
      if (!this.current(generation) || stop.signal.aborted || getServiceRegion() !== 'Development' || wiFiProvCloudBoundary.blocked)
        throw Error('WIFIPROV_OPERATION_CANCELLED');
      assertDeviceV2AccountContext(this.dataService, account);
    };
    try {
      assertCurrent();
      await this.assertProvisioningCloudNetwork(stop.signal);
      const result = await reconcileSealedInstallation(entry, this.allocationStore, this.deviceManagement, assertCurrent, 'Development', stop.signal);
      assertCurrent();
      this.sealedRecoveryMessage = result.state === 'created' ? '原设备卡已创建。此结果不确认设备安装或联网，不会重发配置。'
        : result.state === 'unavailable' ? '原设备卡已变更或不可用，不会重复创建。'
          : result.state === 'not-dispatched' ? '创建请求未发出。原记录保留。'
            : '暂未查到原创建结果，不代表未创建；不会重发。';
    } catch {
      if (this.current(generation)) this.sealedRecoveryMessage = '暂无法核对原设备卡；可手动再查，不会重发配置。';
    } finally {
      clearTimeout(deadline);
      if (this.sealedReadAbort === stop) this.sealedReadAbort = undefined;
      this.recoveryBusy = false;
      if (this.current(generation)) this.cdr.detectChanges();
    }
  }

  async reloadUnknownRecoveries(): Promise<void> {
    if (!this.current(this.generation) || this.operationBusy || this.unknownWiFi || this.sessionReady) return;
    await this.loadUnknownRecoveries(); // Explicit local read only, never Cloud.
    if (this.current(this.generation)) await this.loadSealedRecoveries();
  }

  canRecoverUnknown(entry: WiFiProvUnknownRecovery): boolean {
    return this.current(this.generation) && !this.operationBusy && !this.sessionReady && !this.unknownWiFi
      && this.unknownRecoveries.includes(entry) && wiFiProvUnknownAvailability(entry.checkpoint, Date.now()) === 'available';
  }

  unknownRecoveryMessage(entry: WiFiProvUnknownRecovery): string {
    const availability = wiFiProvUnknownAvailability(entry.checkpoint, Date.now());
    return availability === 'expired' ? '核对记录已过期（24小时），不会继续查询。'
      : availability === 'clock-invalid' ? '手机时间异常，核对已暂停。' : '上次 Wi-Fi 配置回执未知，仅核对云状态。';
  }

  async recoverUnknownWiFi(entry: WiFiProvUnknownRecovery): Promise<void> {
    if (!this.canRecoverUnknown(entry) || !this.unknownHintsAccount) return;
    const account = this.unknownHintsAccount;
    try {
      assertDeviceV2AccountContext(this.dataService, account);
      if (account.authority !== API.BASE_URL) throw Error('WIFIPROV_CHECKPOINT_NOT_CURRENT');
      const checkpoint = { identity: allocationContext(entry.context), deviceInstanceId: entry.deviceInstanceId.slice(),
        attemptedAt: entry.checkpoint.attemptedAt };
      this.confirmedIdentityContext = checkpoint.identity;
      this.unknownWiFi = { ...checkpoint, account: { ...account }, reader: new WiFiProvCloudReconciliation(checkpoint), recovery: entry };
      this.completion = wiFiProvCompletionResult('unknown', 'unconfirmed');
      this.wifiCheckpointState = 'saved'; this.recoveryBlocked = false;
      this.phase = 'error'; this.statusMessage = '原 Wi-Fi 配置回执未知';
      await this.checkUnknownWiFiCloud(); // The user selected this exact entry, not page initialization.
    } catch {
      this.unknownRecoveryError = '账号或配网记录已变化，请重新进入页面核对。';
    }
  }

  async dismissUnknownRecovery(entry: WiFiProvUnknownRecovery): Promise<void> {
    if (!this.current(this.generation) || this.operationBusy || this.wifiCloudState === 'checking'
      || !this.unknownRecoveries.includes(entry) || !this.unknownHintsAccount) return;
    const generation = this.generation, account = this.unknownHintsAccount;
    this.recoveryBusy = true;
    const controller = new AbortController(), deadline = setTimeout(() => controller.abort(), 5000);
    try {
      assertDeviceV2AccountContext(this.dataService, account);
      await unknownLocalStep(controller.signal, () => this.allocationStore.clearUnknown(entry));
      assertDeviceV2AccountContext(this.dataService, account);
      if (!this.current(generation)) return;
      this.unknownRecoveries = this.unknownRecoveries.filter(value => value !== entry);
      if (this.unknownWiFi?.recovery === entry) {
        this.cancelWiFiCloudRead(); this.unknownWiFi = undefined; this.recoveryBlocked = false;
        this.completionAttempt = undefined; this.completion = undefined;
        this.setError('核对提示已移除；原授权和请求记录保留。');
      }
    } catch {
      if (this.current(generation)) this.unknownRecoveryError = '恢复提示清理未确认，记录保留；不会自动重试。';
    } finally {
      clearTimeout(deadline); this.recoveryBusy = false;
      if (this.current(generation)) this.cdr.detectChanges();
    }
  }

  private async assertRecoveryRecord(entry: WiFiProvUnknownRecovery, signal: AbortSignal): Promise<void> {
    const record = await unknownLocalStep(signal, () => this.allocationStore.load(entry.deviceInstanceId));
    if (!record?.context || record.requestId !== entry.requestId || !sameAllocationContext(record.context, entry.context)
      || record.wifiUnknown?.attemptedAt !== entry.checkpoint.attemptedAt
      || record.wifiUnknown?.expiresAt !== entry.checkpoint.expiresAt) {
      throw Object.assign(Error('WIFIPROV_CHECKPOINT_NOT_CURRENT'), { code: 'WIFIPROV_CHECKPOINT_NOT_CURRENT' });
    }
  }

  private clearProvisioningPoP(): void {
    this.provisioningPoP = ''; this.provisioningPoPVisible = false; this.provisioningPoPError = '';
    if (this.softApSpec?.softApPurpose || this.softApSpec?.pop !== undefined) this.softApSpec = undefined;
  }

  private async loadReconfigureContext(): Promise<boolean> {
    if (this.reconfigureTarget === null) return true;
    const generation = this.generation, authority = API.BASE_URL;
    if (!this.current(generation)) return false;
    this.reconfigureReady = false;
    this.phase = 'context';
    this.statusMessage = '正在读取原设备的重新配网上下文…';
    const controller = new AbortController();
    this.reconfigureAbort = controller;
    // One deadline includes initial account restoration and the single GET.
    const deadline = setTimeout(() => controller.abort(), 15000);
    try {
      await this.assertProvisioningCloudNetwork(controller.signal);
      logicalDevicePeerId(this.reconfigureTarget);
      const restored = await waitForWiFiProvAccount(this.dataService, authority, controller.signal);
      if (controller.signal.aborted) throw new Error('配网读取已取消');
      if (!this.current(generation) || authority !== API.BASE_URL) throw new Error('配网读取已失效');
      assertDeviceV2AccountContext(this.dataService, restored);
      const account = this.currentAccount();
      await this.assertProvisioningCloudNetwork(controller.signal);
      this.checkAccount(account);
      if (controller.signal.aborted) throw new Error('配网读取已取消');
      const context = await this.deviceManagement.readDeviceContextV2(this.reconfigureTarget, controller.signal);
      if (controller.signal.aborted) throw new Error('配网读取已取消');
      this.checkAccount(account);
      await this.assertProvisioningCloudNetwork(controller.signal);
      this.checkAccount(account);
      // Never replace an in-flight rotation's original CAS or UNKNOWN identity.
      if (this.reconfigureContext && !sameAllocationContext(this.reconfigureContext, context)) {
        throw new Error('原设备凭据上下文已变化，请返回原设备核对；不会重发未确认请求');
      }
      this.reconfigureContext ??= context;
      this.reconfigureReady = true;
      this.phase = 'idle';
      this.statusMessage = '请确认原设备已进入配网模式，再扫描 BLINKER_ 配网设备';
      return true;
    } catch (error) {
      if (this.current(generation)) this.setError(controller.signal.aborted
        ? '读取原设备超时，请手动重新开始；不会自动重试'
        : this.errorMessage(error, '无法读取原设备，请手动重新开始'));
      return false;
    } finally {
      clearTimeout(deadline);
      if (this.reconfigureAbort === controller) this.reconfigureAbort = undefined;
      if (this.current(generation)) this.cdr.detectChanges();
    }
  }

  async openProvisionedDevice(): Promise<void> {
    assertProvisioningWritable(this.readOnlySoftAp);
    if (!this.canOpenCompletion || this.completion?.officialReceipt !== 'confirmed') return;
    this.completionOpening = true;
    this.completionActionMessage = '';
    const controller = new AbortController(), generation = this.generation;
    this.completionNavigationAbort = controller;
    try { await this.navigateProvisionedDevice(controller.signal); }
    catch (error) {
      if (this.current(generation) && !controller.signal.aborted) {
        if (isUnknownRecoveryInvalid(error)) {
          this.completion = wiFiProvCompletionResult('confirmed', 'blocked', 'context-changed'); this.recoveryBlocked = true;
        }
        this.completionActionMessage = '设备页面暂无法打开，请核对账号与设备后从列表进入；不会重发配置。';
      }
    } finally {
      if (this.completionNavigationAbort === controller) this.completionNavigationAbort = undefined;
      this.completionOpening = false; if (this.current(generation)) this.cdr.detectChanges();
    }
  }

  private async navigateProvisionedDevice(signal: AbortSignal): Promise<void> {
    const attempt = this.completionAttempt;
    const logicalDeviceId = this.allocation?.logicalDeviceId;
    if (!attempt || !logicalDeviceId || logicalDeviceId !== attempt.identity.logicalDeviceId) {
      throw Error('WIFIPROV_KEY_CONTEXT_CHANGED');
    }
    assertDeviceV2AccountContext(this.dataService, attempt.account);
    if (attempt.account.authority !== API.BASE_URL) throw Error('WIFIPROV_KEY_CONTEXT_CHANGED');
    const transport = this.provisionTransport ?? this.selectedDevice?.transport;
    const expected = this.currentAccount();
    const networkBlockedMessage = '设备已确认连接；手机配网网络隔离尚未解除，暂不能进入设备，不会重发配置。';
    const cloudReleased = () => {
      if (!this.softApCloudLease && !wiFiProvCloudBoundary.blocked) return true;
      this.completionActionMessage = networkBlockedMessage;
      return false;
    };
    try {
      await this.releasePlugin();
    } catch {
      if (signal.aborted) return;
      this.checkAccount(expected);
      this.closeFailed = true;
      // The device's WiFi confirmation and native cleanup are separate facts.
      // Keep the journal and owner fence; never convert a confirmed write to a replay.
      this.completionActionMessage = '设备已确认连接；手机配网连接退出尚未确认，暂不能进入设备，不会重发配置。';
      return;
    }
    if (this.destroyed) return;
    this.checkAccount(expected);
    if (signal.aborted) return;
    try {
      // A resumed result uses this explicit navigation's lifetime, not the
      // provisioning lifetime retired when the page entered the background.
      await this.assertProvisioningCloudNetwork(signal);
      this.checkAccount(expected);
      if (!cloudReleased()) return;
      if (transport !== 'softap') assertWiFiProvCloudTransport(transport);
    } catch {
      if (signal.aborted) return;
      this.checkAccount(expected);
      // A confirmed WiFi result stays confirmed. No Cloud refresh or journal
      // cleanup is safe merely because native disconnect returned.
      this.completionActionMessage = networkBlockedMessage;
      return;
    }
    if (signal.aborted) return;
    const context = await this.deviceManagement.readDeviceContextV2(logicalDeviceId, signal);
    this.checkAccount(expected);
    if (signal.aborted) return;
    if (!sameAllocationContext(context, attempt.identity)) throw Error('WIFIPROV_KEY_CONTEXT_CHANGED');
    if (!cloudReleased()) return;
    let loaded: boolean;
    try {
      loaded = await this.userService.getAllInfo();
    } catch {
      this.checkAccount(expected);
      loaded = false; // A list refresh cannot retract confirmed device availability.
    }
    if (this.destroyed) return;
    this.checkAccount(expected);
    if (signal.aborted) return;
    if (!cloudReleased()) return;
    if (!loaded && !this.dataService.getDevice(logicalDeviceId)) {
      this.completionActionMessage = '设备已上线，设备列表暂未刷新，请稍后从设备列表进入。';
      return;
    }
    // Availability is not permission to consume a historical allocation. Older
    // UNKNOWN records have no metadata marker. Retirement/explicit cleanup keep
    // their own contracts; entering a device never clears or replays an intent.
    void this.deviceUi.startDirectHandoff(logicalDeviceId);
    const navigated = await this.navController.navigateRoot(`/device/${encodeURIComponent(logicalDeviceId)}`);
    if (navigated === false) throw Error('WIFIPROV_DEVICE_NAVIGATION_FAILED');
  }

  private async ensurePermissions(transport: WiFiProvTransport, mode: SoftApConnectionMode = 'sdk-managed'): Promise<void> {
    this.phase = 'permissions';
    this.statusMessage = transport === 'ble' ? '正在确认蓝牙配网所需权限…' : '正在确认热点配网所需权限…';
    // Keep the operation snapshot even before a native device has been selected.
    // The narrow port also works with an existing declaration that omits options;
    // runtime acceptance still requires the matching native plugin.
    const client: { requestPermissions(options: { transport: WiFiProvTransport; softApConnectionMode?: SoftApConnectionMode }):
      ReturnType<typeof WiFiProv.requestPermissions> } = WiFiProv;
    const permissions = await client.requestPermissions({ transport,
      ...(mode === 'system-connected' ? { softApConnectionMode: mode } : {}) });
    if (!(['bluetooth', 'location', 'nearbyWifi'] as const).every(key => permissions?.[key] === 'granted')) {
      throw new Error('配网所需权限尚未完整授权，请在系统设置中确认后手动重试');
    }
  }

  private async bindPluginEvents(): Promise<void> {
    const generation = this.generation;
    const update = (work: () => void) => {
      if (this.current(generation) && !this.pluginRelease) this.zone.run(work);
    };
    try {
      this.listeners.push(
        await WiFiProv.addListener('bleScanResult', (device) => {
          update(() => this.upsertDevice(device));
        })
      );
      this.listeners.push(
        await WiFiProv.addListener('bleScanState', (event) => {
          update(() => {
            if (event.state !== 'started' && this.phase === 'scanning') {
              this.phase = 'idle';
              this.statusMessage = this.devices.length
                ? `已发现 ${this.devices.length} 台设备，请选择一台连接`
                : event.message || '扫描已结束，未发现设备';
            }
          });
        })
      );
      this.listeners.push(
        await WiFiProv.addListener('connectionState', (event) => {
          update(() => {
            if (this.completion) return;
            if (this.localAcquisition || (this.softApStages && this.isProvisioning)) return; // Awaited owner results govern phase handoff.
            if (event.device) this.selectedDevice = event.device;
            if (event.state === 'failed')
              this.setError(event.message || '配网会话连接失败');
            if (
              event.state === 'disconnected' &&
              this.phase !== 'success' &&
              this.phase !== 'error'
            ) {
              this.selectedDevice = undefined;
              this.phase = 'idle';
              this.statusMessage = '设备连接已断开';
            }
          });
        })
      );
      this.listeners.push(
        await WiFiProv.addListener('provisioningProgress', (event) => {
          update(() => {
            if (this.completion) return;
            const states: Record<
              typeof event.step,
              { progress: number; message: string }
            > = {
              session: { progress: 18, message: '安全会话已建立' },
              'config-sent': { progress: 42, message: 'Wi-Fi 凭据已发送' },
              'config-applied': {
                progress: 68,
                message: '设备正在应用网络配置',
              },
              'checking-connection': {
                progress: 86,
                message: '正在检查 ESP32 联网状态',
              },
              success: { progress: 90, message: 'Wi-Fi 已连接，正在确认设备可用' },
              failed: { progress: 90, message: '正在确认设备报告的连接结果' },
            };
            this.progress = states[event.step].progress;
            this.statusMessage = event.message || states[event.step].message;
          });
        })
      );
      this.listeners.push(
        await WiFiProv.addListener('error', (event) => {
          update(() =>
            this.setError(event.message || `${event.operation} 操作失败`)
          );
        })
      );
    } catch (error) {
      if (this.current(generation)) this.setError(this.errorMessage(error, '无法初始化 Wi-Fi Provisioning 插件'));
    }
  }

  private upsertDevice(device: BleDevice): void {
    const index = this.devices.findIndex((item) => item.id === device.id);
    const next = [...this.devices];
    if (index >= 0) next[index] = { ...next[index], ...device };
    else next.push(device);
    this.devices = next.sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
  }

  private setError(message: string): void {
    this.phase = 'error';
    this.statusMessage = message;
    if (!this.destroyed && this.viewActive) this.cdr.detectChanges();
  }

  private persistNetwork(): void {
    if (!this.rememberNetwork) {
      localStorage.removeItem('wifiProvNetwork');
      return;
    }
    const data: SavedNetwork = {
      ssid: this.ssid,
      password: this.password,
      remember: true,
    };
    localStorage.setItem('wifiProvNetwork', JSON.stringify(data));
  }

  private restoreNetwork(): void {
    try {
      const raw = localStorage.getItem('wifiProvNetwork');
      if (!raw) return;
      const data = JSON.parse(raw) as SavedNetwork;
      if (!data.remember) return;
      this.ssid = data.ssid || '';
      this.password = data.password || '';
      this.rememberNetwork = true;
    } catch {
      localStorage.removeItem('wifiProvNetwork');
    }
  }

  private clearScanTimer(): void {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = undefined;
  }

  private releasePlugin(): Promise<void> {
    if (!this.nativeSupported) return Promise.resolve();
    if (!this.pluginRelease) this.pluginRelease = this.releasePluginNow();
    return this.pluginRelease;
  }

  private async acquireDiscovery(): Promise<void> {
    if (!this.canOperate) throw new Error('配网页面已关闭');
    const lease = this.discoveryLease ??= bleScanner.acquireExclusive();
    try { await lease; }
    catch (error) { if (this.discoveryLease === lease) this.discoveryLease = undefined; throw error; }
    if (!this.canOperate) throw new Error('配网页面已关闭');
  }

  private async releasePluginNow(): Promise<void> {
    // A late SDK start must finish before native close and lease release.
    await this.initializing?.catch(() => undefined);
    await this.discoveryStarting?.catch(() => undefined);
    await this.discoveryStopping?.catch(() => undefined);
    await this.selectionStarting?.catch(() => undefined);
    const results = await Promise.allSettled([WiFiProv.stopBleScan(), this.stageClosing ?? this.retireSoftApLocal(),
      ...this.listeners.map(listener => listener.remove())]);
    const release = await this.discoveryLease?.catch(() => undefined);
    // An uncertain native close must not let Presence/Direct start over it.
    if (results.some(result => result.status === 'rejected')) throw new Error('BLE_SCAN_CLOSE_FAILED');
    this.listeners = [];
    release?.();
    this.discoveryLease = undefined;
  }

  private errorMessage(error: unknown, fallback: string): string {
    if ((error as { code?: unknown } | null)?.code === 'PROVISIONING_RESULT_UNKNOWN') {
      return '配网回执未知，请核对原设备；不会自动重发配置。';
    }
    const systemMessage = this.readOnlySoftAp ? systemConnectedErrorMessage(error) : undefined;
    if (systemMessage) return systemMessage;
    if ((error as { code?: unknown } | null)?.code === 'WIFIPROV_SOFTAP_ACQUISITION_TIMEOUT') {
      return '热点连接等待已结束，请手动重新开始；不会自动重试。';
    }
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error) return error;
    return fallback;
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2400,
      position: 'bottom',
    });
    await toast.present();
  }
}

function randomBytes(size: number): Uint8Array {
  const output = new Uint8Array(size);
  globalThis.crypto.getRandomValues(output);
  if (!output.some(value => value !== 0)) output[0] = 1;
  return output;
}

function hex(value: Uint8Array): string {
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

function isBootstrapAllocation(value: DeviceAllocation): value is BootstrapAllocation {
  return value.preserveAccess === false && 'directBootstrap' in value;
}

/** A deadline cancels observation only; it cannot cancel or retry a native store operation. */
function unknownLocalStep<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => { cleanup(); reject(Error('WIFIPROV_OPERATION_CANCELLED')); };
    const cleanup = () => signal.removeEventListener('abort', aborted);
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted) throw Error('WIFIPROV_OPERATION_CANCELLED');
      return work();
    }).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

function isUnknownRecoveryInvalid(error: unknown): boolean {
  const value = error as { status?: number; code?: string; message?: string; error?: { errorCode?: string } } | null;
  return [404, 409, 410].includes(value?.status ?? 0)
    || ['WIFIPROV_CHECKPOINT_NOT_CURRENT', 'WIFIPROV_KEY_CONTEXT_CHANGED', 'DEVICE_V2_NOT_FOUND', 'DEVICE_V2_NOT_CURRENT']
      .includes(value?.error?.errorCode ?? value?.code ?? value?.message ?? '');
}
