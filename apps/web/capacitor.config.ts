/**
 * Capacitor configuration for Nexus HEMS Dashboard mobile app.
 *
 * Supports both iOS and Android alongside the existing Tauri desktop build.
 * Push notifications use Firebase Cloud Messaging (Android) and APNs (iOS).
 */
const config = {
  appId: 'com.nexus.hems.dashboard',
  appName: 'Nexus HEMS',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_energy',
      iconColor: '#22ff88',
      sound: 'notification.wav',
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      showSpinner: true,
      spinnerColor: '#22ff88',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
