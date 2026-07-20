import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';

import {
  mapPermissionResponse,
  type AppPermissionState,
} from '@/features/permissions/map-status';

export const NOTIFICATIONS_PERMISSION_RATIONALE =
  'Sunsight sends a short alert when someone nearby catches the sunset. Without notifications you can still send alerts, but you will not receive incoming ones.';

export async function getNotificationsPermissionState(): Promise<AppPermissionState> {
  const response = await Notifications.getPermissionsAsync();
  return mapPermissionResponse(response);
}

export async function requestNotificationsPermission(): Promise<AppPermissionState> {
  const response = await Notifications.requestPermissionsAsync();
  return mapPermissionResponse(response);
}

export async function openAppSettings(): Promise<void> {
  await Linking.openSettings();
}
