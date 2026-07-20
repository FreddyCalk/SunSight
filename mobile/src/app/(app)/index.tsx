import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/AuthProvider';
import { useHomeActions } from '@/features/home/use-home-actions';

export default function HomeRoute() {
  const { signOut } = useAuth();
  const { cooldownActive, busy, status, onLookUp, onCapture, retryLookUp } =
    useHomeActions();

  const primaryDisabled = busy || cooldownActive;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>SUNSIGHT</Text>
        <Text style={styles.title}>Share the sky while it is happening.</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: primaryDisabled }}
            disabled={primaryDisabled}
            onPress={onLookUp}
            style={[styles.primaryAction, primaryDisabled && styles.primaryActionDisabled]}>
            <Text style={styles.actionTitle}>Look up</Text>
            <Text style={styles.actionDescription}>Send a nearby nudge</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: primaryDisabled }}
            disabled={primaryDisabled}
            onPress={onCapture}
            style={[styles.primaryAction, primaryDisabled && styles.primaryActionDisabled]}>
            <Text style={styles.actionTitle}>Capture</Text>
            <Text style={styles.actionDescription}>Photograph tonight&apos;s sunset</Text>
          </Pressable>
        </View>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        {status && !cooldownActive && !busy && status !== 'Look up sent.' ? (
          <Pressable
            accessibilityRole="button"
            onPress={retryLookUp}
            style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        ) : null}
        <Link href="/(app)/permissions" asChild>
          <Pressable accessibilityRole="button" style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Permissions</Text>
          </Pressable>
        </Link>
        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actionDescription: {
    color: '#744819',
    fontSize: 15,
    marginTop: 4,
  },
  actions: {
    gap: 16,
    width: '100%',
  },
  actionTitle: {
    color: '#2B1607',
    fontSize: 24,
    fontWeight: '700',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    gap: 28,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  eyebrow: {
    color: '#945924',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
  },
  primaryAction: {
    backgroundColor: '#F7C987',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  primaryActionDisabled: {
    opacity: 0.55,
  },
  safeArea: {
    backgroundColor: '#FFF7EA',
    flex: 1,
  },
  secondaryButton: {
    paddingVertical: 4,
  },
  secondaryButtonText: {
    color: '#7C6E61',
    fontSize: 15,
  },
  status: {
    color: '#7C6E61',
    fontSize: 14,
    textAlign: 'center',
  },
  title: {
    color: '#2B1607',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
    maxWidth: 360,
    textAlign: 'center',
  },
});
