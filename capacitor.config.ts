import { CapacitorConfig } from '@capacitor/cli';

// Production keeps an HTTPS WebView origin so insecure API/MQTT endpoints are
// rejected by the browser. Local hardware tests may opt in explicitly because
// the development Gateway advertises an isolated ws:// LAN endpoint.
const localCleartext = process.env['BLINKER_LOCAL_CLEARTEXT'] === '1';
const profile = process.env['BLINKER_APP_PROFILE'];
if (profile && profile !== 'cloud-beta') {
  throw new Error('Unknown BLINKER_APP_PROFILE');
}
const cloudBeta = profile === 'cloud-beta';
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
