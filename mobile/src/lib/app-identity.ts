/**
 * Locked app identity per EAS profile / APP_VARIANT.
 * Keep in sync with the duplicated table in `app.config.ts`
 * (Expo config cannot import this module at evaluate time).
 */

export type AppVariant = 'preview' | 'production';

export type AppIdentity = {
  readonly name: string;
  readonly scheme: string;
  readonly iosBundleIdentifier: string;
  readonly androidPackage: string;
};

export const APP_IDENTITIES: Readonly<Record<AppVariant, AppIdentity>> = {
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
};

/** URL schemes keyed by variant — for deep-link matching at runtime. */
export const APP_SCHEMES: Readonly<Record<AppVariant, string>> = {
  preview: APP_IDENTITIES.preview.scheme,
  production: APP_IDENTITIES.production.scheme,
};

function readBakedVariantFromConstants(): unknown {
  try {
    // Lazy require: Metro provides require; Node ESM unit tests do not.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default as {
      expoConfig?: { extra?: { appVariant?: unknown } } | null;
    };
    return Constants?.expoConfig?.extra?.appVariant;
  } catch {
    return undefined;
  }
}

/** Prefer baked Expo extra.appVariant, then APP_VARIANT env; default production. */
export function getAppVariant(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  bakedVariant?: unknown,
): AppVariant {
  if (bakedVariant === 'preview' || bakedVariant === 'production') {
    return bakedVariant;
  }

  if (bakedVariant === undefined) {
    const fromConstants = readBakedVariantFromConstants();
    if (fromConstants === 'preview' || fromConstants === 'production') {
      return fromConstants;
    }
  }

  return env.APP_VARIANT === 'preview' ? 'preview' : 'production';
}

export function getAppIdentity(variant?: AppVariant): AppIdentity {
  return APP_IDENTITIES[variant ?? getAppVariant()];
}
