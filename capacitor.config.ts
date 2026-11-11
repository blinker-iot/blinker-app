import { CapacitorConfig } from '@capacitor/cli';
import { bc5Profile, readBc5Admission, readInitialNetworkAdmission } from './tools/sync-cloud-beta.mjs';

// Production keeps an HTTPS WebView origin so insecure API/MQTT endpoints are
// rejected by the browser. Local hardware tests may opt in explicitly because
// the development Gateway advertises an isolated ws:// LAN endpoint.
const localCleartext = process.env['BLINKER_LOCAL_CLEARTEXT'] === '1';
const profile = process.env['BLINKER_APP_PROFILE'];
if (profile && profile !== 'cloud-beta') {
  throw new Error('Unknown BLINKER_APP_PROFILE');
}
const cloudBeta = profile === 'cloud-beta';
const bc5 = bc5Profile(process.env);
if (bc5 && !cloudBeta) throw new Error('BC-5 requires the explicit cloud beta profile');
const bc5AdmissionFile = process.env['BLINKER_BC5_ADMISSION_FILE'];
const initialNetwork = bc5 === 'initialNetworkAdmission';
if ((!bc5 || initialNetwork) && bc5AdmissionFile !== undefined) {
  throw new Error('BC-5 admission is only permitted for an explicit cloud beta candidate or recovery');
}
const initialNetworkFile = process.env['BLINKER_INITIAL_NETWORK_ADMISSION_FILE'];
if (!initialNetwork && initialNetworkFile !== undefined) {
  throw new Error('Initial network admission is only permitted for an explicit cloud beta recovery');
}
const bc5Admission = initialNetwork ? readInitialNetworkAdmission(initialNetworkFile)
  : bc5 ? readBc5Admission(bc5AdmissionFile) : undefined;
const sealedInstall = process.env['BLINKER_WIFIPROV_SEALED_FIRST_INSTALL'];
if (sealedInstall === '1' && !cloudBeta) {
  throw new Error('Sealed first installation requires an explicit standalone cloud beta candidate');
}
if (cloudBeta && (localCleartext || process.env['BLINKER_DEBUG_NETWORK_CONFIG_DIR'])) {
  throw new Error('Cloud beta must not use local cleartext or debug network trust');
}

const config: CapacitorConfig = {
  appId: cloudBeta ? 'iot.diandeng.tech.beta' : 'iot.diandeng.tech',
  appName: cloudBeta ? 'Blinker 内测' : '点灯·blinker',
  webDir: 'www',
  // Capacitor's debug bridge logs complete plugin arguments and return values.
  // SecureStorage carries DeviceKey/controller credentials, so bridge logging
  // must stay disabled even in debug builds. Blinker diagnostics use explicit,
  // redacted application/device loggers instead.
  loggingBehavior: 'none',
  server: {
    androidScheme: localCleartext ? 'http' : 'https',
    cleartext: localCleartext,
  },
  plugins: {
    ...(bc5 === 'admission' || initialNetwork ? { WiFiProv: { initialCloudWifiCandidate: true } } : {}),
    ...(bc5 ? { BlinkerBc5Checkpoint: { [bc5]: bc5Admission } } : {}),
    ...(sealedInstall === '1' ? { BlinkerWiFiProvAllocation: { enabled: true } } : {}),
    SystemBars: {
      insetsHandling: "css",
      style: "LIGHT",
      hidden: false,
    },
    StatusBar: {
      overlaysWebView: false,
    },
    "SplashScreen": {
      "launchShowDuration": 500,
      "launchAutoHide": true,
      "launchFadeOutDuration": 500,
      "backgroundColor": "#ffffffff",
      "androidSplashResourceName": "splash",
      "androidScaleType": "CENTER_CROP",
      "showSpinner": true,
      "androidSpinnerStyle": "large",
      "iosSpinnerStyle": "small",
      "spinnerColor": "#999999",
      "splashFullScreen": true,
      "splashImmersive": true,
      "layoutName": "launch_screen",
      "useDialog": true
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
