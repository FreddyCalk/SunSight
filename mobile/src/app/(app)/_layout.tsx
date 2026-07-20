import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { ProfileErrorScreen } from '@/features/auth/ProfileErrorScreen';
import { useAppLifecycleSync } from '@/hooks/use-app-lifecycle-sync';

export default function AppLayout() {
  const { gate } = useAuth();
  useAppLifecycleSync();

  if (gate.status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#945924" size="large" />
      </View>
    );
  }

  if (gate.status === 'unauthenticated' || gate.status === 'misconfigured') {
    return <Redirect href="/(auth)/phone" />;
  }

  if (gate.status === 'needs_privacy') {
    return <Redirect href="/(auth)/privacy" />;
  }

  if (gate.status === 'profile_error') {
    return <ProfileErrorScreen />;
  }

  if (gate.status === 'blocked') {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>
          This account is {gate.reason}. Sign out from the phone screen after support review.
        </Text>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    backgroundColor: '#FFF7EA',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  message: {
    color: '#64594F',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
});
