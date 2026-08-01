import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Locked identity table — keep in sync with `src/lib/app-identity.ts`.
 * Duplicated here because Expo's config loader cannot require that TS module.
 *
 * EAS Update / project linkage: omit `extra.eas.projectId` and `updates.url`
 * until `eas init` (or `eas update:configure`) links this app. Do not invent
 * a projectId; fingerprint runtimeVersion is safe to set ahead of that.
 */
const APP_IDENTITIES = {
  preview: {
    name: 'Sunsight Preview',
    scheme: 'sunsight-preview',
    iosBundleIdentifier: 'com.sunsight.app.preview',
    androidPackage: 'com.sunsight.app.preview',
  },
  production: {
    name: 'Sunsight',
    scheme: 'sunsight',
    iosBundleIdentifier: 'com.sunsight.app',
    androidPackage: 'com.sunsight.app',
  },
} as const;

type AppVariant = keyof typeof APP_IDENTITIES;

function resolveVariant(env: NodeJS.ProcessEnv): AppVariant {
  return env.APP_VARIANT === 'preview' ? 'preview' : 'production';
}

const variant = resolveVariant(process.env);
const identity = APP_IDENTITIES[variant];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: identity.name,
  slug: 'sunsight',
  version: '1.0.1',
  runtimeVersion: {
    policy: 'fingerprint',
  },
  description:
    'Sunsight helps friends notice the same exceptional sunset nearby. Sunset icons created by Magnific - Flaticon (https://www.flaticon.com/free-icons/sunset)',
  orientation: 'portrait',
  icon: './assets/expo.icon/Assets/sunset.png',
  scheme: identity.scheme,
  userInterfaceStyle: 'automatic',
  ios: {
    ...config.ios,
    icon: './assets/expo.icon',
    bundleIdentifier: identity.iosBundleIdentifier,
  },
  android: {
    ...config.android,
    adaptiveIcon: {
      backgroundColor: '#FD5D37',
      foregroundImage: './assets/expo.icon/Assets/sunset.png',
    },
    predictiveBackGestureEnabled: false,
    package: identity.androidPackage,
  },
  web: {
    output: 'static',
    favicon: './assets/expo.icon/Assets/sunset.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FD5D37',
        image: './assets/expo.icon/Assets/sunset.png',
        imageWidth: 200,
      },
    ],
    'expo-secure-store',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Sunsight uses your location while the app is open to find nearby sunset alerts from people you know.',
      },
    ],
    [
      'expo-contacts',
      {
        contactsPermission:
          'Sunsight uses your contacts to find people nearby who already use the app.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          "Sunsight uses the camera when you choose Capture to photograph tonight's sunset.",
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    'expo-notifications',
    'expo-web-browser',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    ...config.extra,
    appVariant: variant,
    eas: {
      projectId: '8aff7ac0-92af-406e-a302-d5fb38c6fae9',
    },
  },
});
