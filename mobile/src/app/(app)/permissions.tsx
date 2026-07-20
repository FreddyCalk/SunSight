import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PermissionModule } from '@/components/PermissionModule';
import {
  CAMERA_PERMISSION_RATIONALE,
  getCameraPermissionState,
  openAppSettings as openCameraSettings,
  requestCameraPermission,
} from '@/features/permissions/camera';
import {
  CONTACTS_PERMISSION_RATIONALE,
  getContactsPermissionState,
  openAppSettings as openContactsSettings,
  requestContactsPermission,
} from '@/features/permissions/contacts';
import {
  LOCATION_PERMISSION_RATIONALE,
  getLocationPermissionState,
  openAppSettings as openLocationSettings,
  requestLocationPermission,
} from '@/features/permissions/location';
import {
  NOTIFICATIONS_PERMISSION_RATIONALE,
  getNotificationsPermissionState,
  openAppSettings as openNotificationsSettings,
  requestNotificationsPermission,
} from '@/features/permissions/notifications';

export default function PermissionsRoute() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>PERMISSIONS</Text>
        <Text style={styles.title}>Enable what you need</Text>
        <Text style={styles.description}>
          Sunsight asks for each capability only when you choose it here — never
          all at once. After a denial, use Open Settings to recover.
        </Text>

        <View style={styles.list}>
          <PermissionModule
            getState={getNotificationsPermissionState}
            openSettings={openNotificationsSettings}
            rationale={NOTIFICATIONS_PERMISSION_RATIONALE}
            request={requestNotificationsPermission}
            title="Notifications"
          />
          <PermissionModule
            getState={getLocationPermissionState}
            openSettings={openLocationSettings}
            rationale={LOCATION_PERMISSION_RATIONALE}
            request={requestLocationPermission}
            title="Location"
          />
          <PermissionModule
            getState={getContactsPermissionState}
            openSettings={openContactsSettings}
            rationale={CONTACTS_PERMISSION_RATIONALE}
            request={requestContactsPermission}
            title="Contacts"
          />
          <PermissionModule
            getState={getCameraPermissionState}
            openSettings={openCameraSettings}
            rationale={CAMERA_PERMISSION_RATIONALE}
            request={requestCameraPermission}
            title="Camera"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  description: {
    color: '#64594F',
    fontSize: 16,
    lineHeight: 24,
  },
  eyebrow: {
    color: '#945924',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  list: {
    gap: 14,
  },
  safeArea: {
    backgroundColor: '#FFF7EA',
    flex: 1,
  },
  title: {
    color: '#2B1607',
    fontSize: 34,
    fontWeight: '700',
  },
});
