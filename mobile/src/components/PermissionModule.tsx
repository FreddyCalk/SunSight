import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppPermissionState } from '@/features/permissions/map-status';

type PermissionModuleProps = {
  title: string;
  rationale: string;
  getState: () => Promise<AppPermissionState>;
  request: () => Promise<AppPermissionState>;
  openSettings: () => Promise<void>;
};

export function PermissionModule({
  title,
  rationale,
  getState,
  request,
  openSettings,
}: PermissionModuleProps) {
  const [state, setState] = useState<AppPermissionState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [showRationale, setShowRationale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getState().then((next) => {
      if (!cancelled) {
        setState(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [getState]);

  const onContinue = useCallback(async () => {
    setBusy(true);
    try {
      const next = await request();
      setState(next);
      setShowRationale(false);
    } finally {
      setBusy(false);
    }
  }, [request]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.status}>Status: {state}</Text>

      {state === 'loading' ? <ActivityIndicator color="#945924" /> : null}

      {state === 'undetermined' || state === 'denied' ? (
        showRationale ? (
          <View style={styles.rationaleBlock}>
            <Text style={styles.rationale}>{rationale}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void onContinue()}
              style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>
                {busy ? 'Requesting…' : 'Continue'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowRationale(false)}
              style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Not now</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowRationale(true)}
            style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Enable {title.toLowerCase()}</Text>
          </Pressable>
        )
      ) : null}

      {state === 'blocked' ? (
        <View style={styles.rationaleBlock}>
          <Text style={styles.rationale}>
            {title} access is turned off. Open Settings to enable it for Sunsight.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void openSettings()}
            style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Open Settings</Text>
          </Pressable>
        </View>
      ) : null}

      {state === 'granted' ? (
        <Text style={styles.granted}>Enabled</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF1DE',
    borderRadius: 18,
    gap: 12,
    padding: 16,
    width: '100%',
  },
  granted: {
    color: '#3F6B3A',
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2B1607',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFF7EA',
    fontSize: 16,
    fontWeight: '600',
  },
  rationale: {
    color: '#64594F',
    fontSize: 15,
    lineHeight: 22,
  },
  rationaleBlock: {
    gap: 10,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#7C6E61',
    fontSize: 15,
  },
  status: {
    color: '#7C6E61',
    fontSize: 13,
  },
  title: {
    color: '#2B1607',
    fontSize: 18,
    fontWeight: '700',
  },
});
