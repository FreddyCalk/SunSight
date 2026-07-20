import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/AuthProvider';
import { PRIVACY_POLICY_VERSION } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';

export default function PrivacyGateRoute() {
  const { gate, refreshProfile, signOut } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (gate.status === 'unauthenticated' || gate.status === 'misconfigured') {
    return <Redirect href="/(auth)/phone" />;
  }

  if (gate.status === 'ready') {
    return <Redirect href="/(app)" />;
  }

  if (gate.status !== 'needs_privacy') {
    return <Redirect href="/" />;
  }

  const onAccept = async () => {
    if (!accepted) {
      setError('Accept the privacy policy to continue.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const client = requireSupabase();
      const { error: rpcError } = await client.rpc('finalize_verified_profile', {
        p_privacy_policy_version: PRIVACY_POLICY_VERSION,
      });

      if (rpcError) {
        throw new Error(rpcError.message || 'Could not activate your profile.');
      }

      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate your profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>PRIVACY</Text>
        <Text style={styles.title}>Before you look up</Text>
        <Text style={styles.description}>
          Sunsight helps friends notice the same sunset. We use your verified
          phone number, coarse location while the app is open, and — only with
          permission — contacts to find nearby people who already use Sunsight.
          Contact numbers are sent over TLS, matched with a server secret, then
          discarded. Sunset photos stay in a private bucket and expire.
        </Text>
        <Text style={styles.version}>Policy version {PRIVACY_POLICY_VERSION}</Text>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          onPress={() => setAccepted((value) => !value)}
          style={styles.checkboxRow}>
          <View style={[styles.checkbox, accepted && styles.checkboxChecked]} />
          <Text style={styles.checkboxLabel}>
            I accept the Sunsight privacy policy for this version.
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void onAccept()}
          style={styles.primaryButton}>
          {busy ? (
            <ActivityIndicator color="#FFF7EA" />
          ) : (
            <Text style={styles.primaryButtonText}>Continue</Text>
          )}
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

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
  checkbox: {
    borderColor: '#945924',
    borderRadius: 6,
    borderWidth: 2,
    height: 22,
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: '#945924',
  },
  checkboxLabel: {
    color: '#2B1607',
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  checkboxRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  content: {
    flex: 1,
    gap: 18,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  description: {
    color: '#64594F',
    fontSize: 16,
    lineHeight: 24,
  },
  error: {
    color: '#9B2C2C',
    fontSize: 14,
    lineHeight: 20,
  },
  eyebrow: {
    color: '#945924',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2B1607',
    borderRadius: 14,
    minHeight: 52,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFF7EA',
    fontSize: 17,
    fontWeight: '600',
  },
  safeArea: {
    backgroundColor: '#FFF7EA',
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#7C6E61',
    fontSize: 15,
  },
  title: {
    color: '#2B1607',
    fontSize: 34,
    fontWeight: '700',
  },
  version: {
    color: '#7C6E61',
    fontSize: 13,
  },
});
