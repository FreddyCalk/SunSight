import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';

import {
  mapPermissionResponse,
  type AppPermissionState,
} from '@/features/permissions/map-status';

export const CONTACTS_PERMISSION_RATIONALE =
  'Sunsight uses your contacts to find people nearby who already use the app, so Look up and Capture can reach them. Supported phone numbers are sent over an encrypted connection, briefly processed for matching, then discarded.';

export async function getContactsPermissionState(): Promise<AppPermissionState> {
  const response = await Contacts.getPermissionsAsync();
  return mapPermissionResponse(response);
}

export async function requestContactsPermission(): Promise<AppPermissionState> {
  const response = await Contacts.requestPermissionsAsync();
  return mapPermissionResponse(response);
}

export async function openAppSettings(): Promise<void> {
  await Linking.openSettings();
}
