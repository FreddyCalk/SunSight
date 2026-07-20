import { Camera } from 'expo-camera';
import * as Linking from 'expo-linking';

import {
  mapPermissionResponse,
  type AppPermissionState,
} from '@/features/permissions/map-status';

export const CAMERA_PERMISSION_RATIONALE =
  "Sunsight needs camera access only when you choose Capture, so you can photograph tonight's sunset before sending it.";

export async function getCameraPermissionState(): Promise<AppPermissionState> {
  const response = await Camera.getCameraPermissionsAsync();
  return mapPermissionResponse(response);
}

export async function requestCameraPermission(): Promise<AppPermissionState> {
  const response = await Camera.requestCameraPermissionsAsync();
  return mapPermissionResponse(response);
}

export async function openAppSettings(): Promise<void> {
  await Linking.openSettings();
}
