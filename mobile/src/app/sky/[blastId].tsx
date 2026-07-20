import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/AuthProvider';
import { mapSkyWindowAccessError } from '@/features/sky-window/access-errors';
import {
  skyWindowAccessQueryOptions,
  type BlastAccess,
} from '@/features/sky-window/get-blast-access';
import { supabase } from '@/lib/supabase';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatRelativeTime(createdAt: string): string {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(createdAt)) / 1_000),
  );
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 60) {
    return 'just now';
  }
  if (elapsedSeconds < 3_600) {
    const minutes = Math.floor(elapsedSeconds / 60);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (elapsedSeconds < 86_400) {
    const hours = Math.floor(elapsedSeconds / 3_600);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  const days = Math.floor(elapsedSeconds / 86_400);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

function Atmosphere() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.atmosphereTop} />
      <View style={styles.atmosphereSun} />
      <View style={styles.atmosphereHorizon} />
    </View>
  );
}

function DismissButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="Dismiss Sky Window"
      accessibilityRole="button"
      hitSlop={12}
      onPress={onPress}
      style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
    >
      <Text style={styles.dismissText}>Close</Text>
    </Pressable>
  );
}

function MessageOverlay({ access }: { access: BlastAccess }) {
  return (
    <View style={styles.messageOverlay}>
      <Text style={styles.sender}>{access.senderDisplayName}</Text>
      {access.kind === 'nudge' ? (
        <Text style={styles.nudgeMessage}>The sky is happening.</Text>
      ) : null}
      <Text style={styles.relativeTime}>{formatRelativeTime(access.createdAt)}</Text>
    </View>
  );
}

export default function SkyWindowRoute() {
  const { blastId } = useLocalSearchParams<{ blastId: string }>();
  const router = useRouter();
  const { gate, session, signOut } = useAuth();
  const [failedMediaUrl, setFailedMediaUrl] = useState<string | null>(null);
  const validBlastId =
    typeof blastId === 'string' && UUID_PATTERN.test(blastId) ? blastId : null;
  const canFetch =
    gate.status === 'ready' && Boolean(supabase && session && validBlastId);
  const accessQuery = useQuery({
    ...skyWindowAccessQueryOptions(
      supabase,
      session?.user.id ?? 'anonymous',
      validBlastId ?? 'invalid',
    ),
    enabled: canFetch,
  });

  const dismiss = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(app)');
  };

  if (gate.status === 'loading' || (canFetch && accessQuery.isPending)) {
    return (
      <View style={styles.stateScreen}>
        <StatusBar style="light" />
        <ActivityIndicator color="#FFF7EA" size="large" />
        <Text style={styles.stateBody}>Opening the sky…</Text>
      </View>
    );
  }

  if (gate.status !== 'ready') {
    return (
      <View style={styles.stateScreen}>
        <StatusBar style="light" />
        <Text style={styles.stateTitle}>This Sky Window is private.</Text>
        <Text style={styles.stateBody}>
          Sign in to check whether this sunset alert is for you.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/')}
          style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
        >
          <Text style={styles.stateButtonText}>Continue</Text>
        </Pressable>
      </View>
    );
  }

  if (!validBlastId || accessQuery.isError) {
    const errorKind = validBlastId
      ? mapSkyWindowAccessError(accessQuery.error)
      : 'unavailable';
    const retryable = errorKind === 'retryable';
    const authError = errorKind === 'auth';

    return (
      <SafeAreaView style={styles.stateScreen}>
        <StatusBar style="light" />
        <Text style={styles.stateTitle}>
          {authError
            ? 'Sign in again to open this sky.'
            : retryable
              ? 'The sky is out of reach.'
              : 'This sky has passed.'}
        </Text>
        <Text style={styles.stateBody}>
          {authError
            ? 'Your session could not be verified. Refresh your sign-in and try the alert again.'
            : retryable
              ? 'Check your connection and try once more.'
              : 'This sunset alert may have expired or was not shared with you.'}
        </Text>
        {authError ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void signOut().then(() => router.replace('/(auth)/phone'));
            }}
            style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
          >
            <Text style={styles.stateButtonText}>Refresh sign-in</Text>
          </Pressable>
        ) : retryable ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void accessQuery.refetch()}
            style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
          >
            <Text style={styles.stateButtonText}>Try again</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={dismiss} hitSlop={10}>
          <Text style={styles.quietAction}>Dismiss</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const access = accessQuery.data;
  if (!access) {
    return null;
  }

  const imageFailed =
    access.kind === 'photo' &&
    Boolean(access.mediaUrl && failedMediaUrl === access.mediaUrl);

  if (access.kind === 'photo' && imageFailed) {
    return (
      <SafeAreaView style={styles.stateScreen}>
        <StatusBar style="light" />
        <Text style={styles.stateTitle}>This sky has passed.</Text>
        <Text style={styles.stateBody}>
          The private photo is no longer available.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setFailedMediaUrl(null);
            void accessQuery.refetch();
          }}
          style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
        >
          <Text style={styles.stateButtonText}>Try again</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={dismiss} hitSlop={10}>
          <Text style={styles.quietAction}>Dismiss</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.window}>
      <StatusBar style="light" />
      {access.kind === 'photo' && access.mediaUrl ? (
        <Image
          accessibilityLabel={`Sunset photographed by ${access.senderDisplayName}`}
          cachePolicy="none"
          contentFit="cover"
          onError={() => setFailedMediaUrl(access.mediaUrl)}
          source={{ uri: access.mediaUrl }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Atmosphere />
      )}
      <View style={styles.scrim} pointerEvents="none" />
      <SafeAreaView style={styles.overlay}>
        <View style={styles.topBar}>
          <Text style={styles.eyebrow}>SKY WINDOW</Text>
          <DismissButton onPress={dismiss} />
        </View>
        <MessageOverlay access={access} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  atmosphereHorizon: {
    backgroundColor: '#D05C35',
    bottom: 0,
    height: '34%',
    left: 0,
    opacity: 0.85,
    position: 'absolute',
    right: 0,
  },
  atmosphereSun: {
    backgroundColor: '#FFD38A',
    borderRadius: 110,
    height: 220,
    left: '22%',
    opacity: 0.72,
    position: 'absolute',
    top: '43%',
    width: 220,
  },
  atmosphereTop: {
    backgroundColor: '#48385D',
    bottom: '34%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dismiss: {
    backgroundColor: 'rgba(18, 12, 16, 0.34)',
    borderColor: 'rgba(255, 255, 255, 0.26)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dismissText: {
    color: '#FFF7EA',
    fontSize: 14,
    fontWeight: '600',
  },
  eyebrow: {
    color: 'rgba(255, 247, 234, 0.78)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.4,
  },
  messageOverlay: {
    alignItems: 'center',
    marginTop: 'auto',
    paddingBottom: 42,
    paddingHorizontal: 24,
  },
  nudgeMessage: {
    color: '#FFF7EA',
    fontSize: 38,
    fontWeight: '600',
    letterSpacing: -1,
    lineHeight: 43,
    marginTop: 14,
    maxWidth: 340,
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
  },
  pressed: {
    opacity: 0.66,
  },
  quietAction: {
    color: 'rgba(255, 247, 234, 0.72)',
    fontSize: 15,
    marginTop: 4,
    padding: 10,
  },
  relativeTime: {
    color: 'rgba(255, 247, 234, 0.76)',
    fontSize: 14,
    marginTop: 9,
  },
  scrim: {
    backgroundColor: 'rgba(12, 8, 13, 0.24)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sender: {
    color: '#FFF7EA',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateBody: {
    color: '#D9D2CA',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 330,
    textAlign: 'center',
  },
  stateButton: {
    backgroundColor: '#FFF7EA',
    borderRadius: 24,
    marginTop: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  stateButtonText: {
    color: '#34242D',
    fontSize: 15,
    fontWeight: '700',
  },
  stateScreen: {
    alignItems: 'center',
    backgroundColor: '#221821',
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stateTitle: {
    color: '#FFF7EA',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
    maxWidth: 340,
    textAlign: 'center',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  window: {
    backgroundColor: '#221821',
    flex: 1,
  },
});
