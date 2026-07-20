import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { z } from 'zod';

import { invokeEdgeFunction } from '@/lib/edge';
import type { SunsightClient } from '@/lib/supabase';
import { getNotificationsPermissionState } from '@/features/permissions/notifications';

const registerDeviceResponseSchema = z.object({
  deviceId: z.string().uuid(),
});

function resolveExpoProjectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId
  );
}

function resolvePlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios') {
    return 'ios';
  }
  if (Platform.OS === 'android') {
    return 'android';
  }
  return null;
}

/**
 * Register or refresh the Expo push token when notification permission is already granted.
 * Does not prompt. No-ops on web, simulators without tokens, or when permission is missing.
 */
export async function registerDeviceIfAllowed(
  client: SunsightClient,
): Promise<{ deviceId: string } | null> {
  const platform = resolvePlatform();
  if (!platform) {
    return null;
  }

  if (!Device.isDevice) {
    return null;
  }

  const permission = await getNotificationsPermissionState();
  if (permission !== 'granted') {
    return null;
  }

  const projectId = resolveExpoProjectId();
  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  if (!/^ExponentPushToken\[[A-Za-z0-9_-]+\]$/.test(token.data)) {
    return null;
  }

  const appVersion = Constants.expoConfig?.version ?? undefined;

  return invokeEdgeFunction(
    client,
    'register-device',
    {
      pushToken: token.data,
      platform,
      ...(appVersion ? { appVersion } : {}),
    },
    registerDeviceResponseSchema,
  );
}
