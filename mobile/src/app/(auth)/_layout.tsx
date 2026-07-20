import { Redirect, Stack, useSegments } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { ProfileErrorScreen } from '@/features/auth/ProfileErrorScreen';

export default function AuthLayout() {
  const { gate } = useAuth();
  const segments = useSegments() as string[];
  const onPrivacy = segments.includes('privacy');

  if (gate.status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#945924" size="large" />
      </View>
    );
  }

  if (gate.status === 'ready') {
    return <Redirect href="/(app)" />;
  }

  if (gate.status === 'misconfigured') {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>
          Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env.local.
        </Text>
      </View>
    );
  }

  if (gate.status === 'needs_privacy' && !onPrivacy) {
    return <Redirect href="/(auth)/privacy" />;
  }

  if (gate.status === 'profile_error') {
    return <ProfileErrorScreen />;
  }

  if (gate.status === 'unauthenticated' && onPrivacy) {
    return <Redirect href="/(auth)/phone" />;
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
