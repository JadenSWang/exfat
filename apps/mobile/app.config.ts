import type { ExpoConfig } from 'expo/config'

/**
 * Typed Expo app configuration.
 *
 * Secrets are never baked in here — the app reads `EXPO_PUBLIC_*` values from
 * the environment at runtime (see `lib/supabase.ts`).
 *
 * `newArchEnabled` is a valid runtime key but is not yet part of the SDK's
 * `ExpoConfig` type (New Architecture is the SDK 56 default), so we widen the
 * type to keep it explicit and typechecked.
 */
const config: ExpoConfig & { newArchEnabled?: boolean } = {
  name: 'exFat',
  slug: 'exfat',
  scheme: 'exfat',
  version: '0.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'com.workout.app',
    usesAppleSignIn: true,
    supportsTablet: false,
  },
  android: {
    package: 'com.workout.app',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
    [
      'expo-camera',
      {
        cameraPermission: 'exFat uses the camera to scan food barcodes.',
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
}

export default config
