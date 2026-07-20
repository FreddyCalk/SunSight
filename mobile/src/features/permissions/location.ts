import * as Location from 'expo-location';
import * as Linking from 'expo-linking';

import {
  mapPermissionResponse,
  type AppPermissionState,
} from '@/features/permissions/map-status';

export const LOCATION_PERMISSION_RATIONALE =
  'Sunsight uses your location while the app is open to decide who is nearby enough to receive a sunset alert. Exact coordinates are never shown to other people.';

export async function getLocationPermissionState(): Promise<AppPermissionState> {
  const response = await Location.getForegroundPermissionsAsync();
  return mapPermissionResponse(response);
}

export async function requestLocationPermission(): Promise<AppPermissionState> {
  const response = await Location.requestForegroundPermissionsAsync();
  return mapPermissionResponse(response);
}

export async function openAppSettings(): Promise<void> {
  await Linking.openSettings();
}
