import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'iot.diandeng.tech',
  appName: '点灯·blinker',
  webDir: 'www',
  // Capacitor's debug bridge logs complete plugin arguments and return values.
  // SecureStorage carries DeviceKey/controller credentials, so bridge logging
  // must stay disabled even in debug builds. Blinker diagnostics use explicit,
  // redacted application/device loggers instead.
  loggingBehavior: 'none',
  server: {
    androidScheme: 'https'
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
