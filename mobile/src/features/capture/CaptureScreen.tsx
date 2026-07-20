import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraView } from 'expo-camera';
import { Image } from 'expo-image';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/AuthProvider';
import {
  activeCooldownMessage,
  createCooldownState,
  SHARED_COOLDOWN_MESSAGE,
} from '@/features/blasts/cooldown';
import { blastKeys, type BlastCooldownState } from '@/features/blasts/keys';
import {
  clearCaptureDraft,
  loadCaptureDraft,
  saveCaptureDraft,
} from '@/features/capture/draft';
import {
  initialCaptureMachineState,
  progressLabel,
  reduceCaptureMachine,
  resolveIdempotencyKeyForConfirm,
} from '@/features/capture/draft-machine';
import { sendPhotoBlast } from '@/features/capture/send-photo';
import { CONTACTS_MATCHING_DISCLOSURE } from '@/features/contacts/consent';
import { CLIENT_COOLDOWN_MS } from '@/features/home/use-home-actions';
import {
  CAMERA_PERMISSION_RATIONALE,
  getCameraPermissionState,
  openAppSettings,
  requestCameraPermission,
} from '@/features/permissions/camera';
import { mintBlastIdempotencyKey } from '@/features/blasts/create-blast';
import {
  getNotificationsPermissionState,
  NOTIFICATIONS_PERMISSION_RATIONALE,
} from '@/features/permissions/notifications';
import { requireSupabase } from '@/lib/supabase';

function promptConsent(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert('Find people nearby', CONTACTS_MATCHING_DISCLOSURE, [
      { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Allow matching', onPress: () => resolve(true) },
    ]);
  });
}

export function CaptureScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const cameraRef = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [state, dispatch] = useReducer(
    reduceCaptureMachine,
    undefined,
    initialCaptureMachineState,
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      dispatch({ type: 'permission_loading' });
      const permission = await getCameraPermissionState();
      if (cancelled) {
        return;
      }

      if (userId) {
        const draft = await loadCaptureDraft(userId);
        if (!cancelled && draft?.rawUri) {
          dispatch({ type: 'restore_draft', draft });
        }
      }

      if (cancelled) {
        return;
      }

      if (permission === 'granted') {
        dispatch({ type: 'permission_granted' });
      } else if (permission === 'blocked') {
        dispatch({ type: 'permission_blocked' });
      } else if (permission === 'undetermined') {
        dispatch({ type: 'permission_undetermined' });
      } else {
        dispatch({ type: 'permission_denied' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !state.draft.rawUri) {
      return;
    }
    void saveCaptureDraft(userId, state.draft);
  }, [state.draft, userId]);

  const setSharedCooldown = useCallback(
    (message: string) => {
      if (!userId) {
        return;
      }
      queryClient.setQueryData(
        blastKeys.cooldown(userId),
        createCooldownState(Date.now(), CLIENT_COOLDOWN_MS, message),
      );
    },
    [queryClient, userId],
  );

  const sendMutation = useMutation({
    mutationFn: async () => {
      const client = requireSupabase();
      if (!userId) {
        throw new Error('Sign in to send a Capture.');
      }
      const idempotencyKey = resolveIdempotencyKeyForConfirm(
        state.draft.idempotencyKey,
        mintBlastIdempotencyKey,
      );
      dispatch({ type: 'confirm_send', idempotencyKey });

      return sendPhotoBlast(
        client,
        userId,
        { requestContactsConsent: promptConsent },
        {
          draft: { ...state.draft, idempotencyKey },
          idempotencyKey,
          onProgress: (step) => {
            if (step !== 'idle') {
              dispatch({ type: 'send_step', step });
            }
          },
        },
      );
    },
    onSuccess: async (result) => {
      if (result.ok) {
        await clearCaptureDraft(userId);
        queryClient.setQueryData(
          blastKeys.detail(userId, result.blast.blastId),
          result.blast,
        );
        setSharedCooldown(SHARED_COOLDOWN_MESSAGE);
        dispatch({
          type: 'send_succeeded',
          blastId: result.blast.blastId,
        });
        return;
      }

      dispatch({
        type: 'send_failed',
        kind:
          result.phase === 'cooldown'
            ? 'cooldown'
            : result.phase === 'terminal_error'
              ? 'terminal'
              : 'retryable',
        message: result.message,
        code: result.code ?? 'SEND_FAILED',
        draft: result.draft,
      });

      if (result.phase === 'cooldown') {
        setSharedCooldown(result.message);
      }

      if (userId && result.draft.rawUri) {
        await saveCaptureDraft(userId, result.draft);
      }
    },
    onError: (error) => {
      dispatch({
        type: 'send_failed',
        kind: 'retryable',
        message: error instanceof Error ? error.message : 'Something went wrong.',
        code: 'CLIENT_ERROR',
      });
    },
  });

  const onSend = useCallback(async () => {
    const cooldown = queryClient.getQueryData<BlastCooldownState>(
      blastKeys.cooldown(userId),
    );
    const cooldownMessage = activeCooldownMessage(cooldown, Date.now());
    if (cooldownMessage) {
      dispatch({
        type: 'send_failed',
        kind: 'cooldown',
        message: cooldownMessage,
        code: 'CLIENT_COOLDOWN',
      });
      return;
    }

    const notificationsGranted =
      (await getNotificationsPermissionState().catch(() => 'denied')) ===
      'granted';
    if (!notificationsGranted) {
      Alert.alert('Incoming alerts are off', NOTIFICATIONS_PERMISSION_RATIONALE);
    }
    sendMutation.mutate();
  }, [queryClient, sendMutation, userId]);

  const onRequestPermission = useCallback(async () => {
    const next = await requestCameraPermission();
    if (next === 'granted') {
      dispatch({ type: 'permission_granted' });
    } else if (next === 'blocked') {
      dispatch({ type: 'permission_blocked' });
    } else {
      dispatch({ type: 'permission_denied' });
    }
  }, []);

  const onTakePicture = useCallback(async () => {
    if (!cameraRef.current || !cameraReady || capturing) {
      return;
    }
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        exif: false,
        shutterSound: false,
      });
      if (photo?.uri) {
        dispatch({ type: 'captured', uri: photo.uri });
      }
    } catch {
      dispatch({
        type: 'send_failed',
        kind: 'retryable',
        message: 'Could not take a photo. Try again.',
        code: 'CAPTURE_FAILED',
      });
    } finally {
      setCapturing(false);
    }
  }, [cameraReady, capturing]);

  const onRetake = useCallback(async () => {
    if (userId) {
      await clearCaptureDraft(userId);
    }
    dispatch({ type: 'retake' });
  }, [userId]);

  const showCamera =
    isFocused &&
    state.phase === 'camera' &&
    !sendMutation.isPending;

  const previewUri = state.draft.preparedUri ?? state.draft.rawUri;
  const busy = sendMutation.isPending || state.phase === 'sending';
  const statusText =
    busy && progressLabel(state.sendStep)
      ? progressLabel(state.sendStep)
      : state.message;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Capture</Text>
        <View style={styles.headerSpacer} />
      </View>

      {state.phase === 'checking_permission' ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#945924" size="large" />
        </View>
      ) : null}

      {state.phase === 'needs_permission' ? (
        <View style={styles.centered}>
          <Text style={styles.title}>Camera access</Text>
          <Text style={styles.body}>{CAMERA_PERMISSION_RATIONALE}</Text>
          <Text style={styles.hint}>
            Look up still works from home without the camera.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void onRequestPermission()}
            style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      ) : null}

      {state.phase === 'permission_blocked' ? (
        <View style={styles.centered}>
          <Text style={styles.title}>Camera is off</Text>
          <Text style={styles.body}>{state.message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void openAppSettings()}
            style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Open Settings</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(app)')}
            style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to Look up</Text>
          </Pressable>
        </View>
      ) : null}

      {showCamera ? (
        <View style={styles.cameraWrap}>
          <CameraView
            ref={cameraRef}
            facing="back"
            mode="picture"
            style={styles.camera}
            onCameraReady={() => setCameraReady(true)}
          />
          <View style={styles.cameraControls}>
            <Pressable
              accessibilityRole="button"
              disabled={!cameraReady || capturing}
              onPress={() => void onTakePicture()}
              style={[
                styles.shutter,
                (!cameraReady || capturing) && styles.shutterDisabled,
              ]}
            />
          </View>
        </View>
      ) : null}

      {!isFocused && state.phase === 'camera' ? (
        <View style={styles.centered}>
          <Text style={styles.body}>Camera paused</Text>
        </View>
      ) : null}

      {(state.phase === 'review' ||
        state.phase === 'sending' ||
        state.phase === 'retryable_error' ||
        state.phase === 'terminal_error' ||
        state.phase === 'cooldown') &&
      previewUri ? (
        <View style={styles.reviewWrap}>
          <Image source={{ uri: previewUri }} style={styles.preview} contentFit="cover" />
          {statusText ? <Text style={styles.status}>{statusText}</Text> : null}

          {state.phase === 'review' ||
          state.phase === 'retryable_error' ||
          state.phase === 'terminal_error' ? (
            <View style={styles.reviewActions}>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void onRetake()}
                style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Retake</Text>
              </Pressable>
              {state.phase === 'review' || state.phase === 'retryable_error' ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void onSend()}
                  style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}>
                  <Text style={styles.primaryButtonText}>
                    {busy
                      ? 'Sending…'
                      : state.phase === 'retryable_error'
                        ? 'Try again'
                        : 'Send sunset'}
                  </Text>
                </Pressable>
              ) : null}
              {state.phase === 'terminal_error' ? (
                <>
                  {state.code === 'MEDIA_PROCESSOR_UNAVAILABLE' ? (
                    <Text style={styles.hint}>
                      Photo processing is temporarily unavailable on the server.
                      Your draft is kept; Look up still works from home.
                    </Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.replace('/(app)')}
                    style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>Back to home</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}

          {state.phase === 'cooldown' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/(app)')}
              style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Back to home</Text>
            </Pressable>
          ) : null}

          {state.phase === 'sending' ? (
            <ActivityIndicator color="#945924" style={styles.spinner} />
          ) : null}
        </View>
      ) : null}

      {state.phase === 'success' ? (
        <View style={styles.centered}>
          <Text style={styles.title}>Sunset sent</Text>
          <Text style={styles.body}>
            Your photo blast was accepted. Shared cooldown applies to Look up too.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(app)')}
            style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
        </View>
      ) : null}

      {(state.phase === 'review' ||
        state.phase === 'sending' ||
        state.phase === 'retryable_error' ||
        state.phase === 'terminal_error' ||
        state.phase === 'cooldown') &&
      !previewUri ? (
        <View style={styles.centered}>
          <Text style={styles.body}>Draft photo is missing. Take a new picture.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void onRetake()}
            style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Open camera</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    color: '#64594F',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  camera: {
    flex: 1,
  },
  cameraControls: {
    alignItems: 'center',
    bottom: 36,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  cameraWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerButton: {
    minWidth: 64,
    paddingVertical: 8,
  },
  headerButtonText: {
    color: '#7C6E61',
    fontSize: 16,
  },
  headerSpacer: {
    minWidth: 64,
  },
  headerTitle: {
    color: '#2B1607',
    fontSize: 17,
    fontWeight: '700',
  },
  hint: {
    color: '#7C6E61',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  preview: {
    backgroundColor: '#2B1607',
    borderRadius: 16,
    flex: 1,
    minHeight: 320,
    width: '100%',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2B1607',
    borderRadius: 14,
    minWidth: 160,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFF7EA',
    fontSize: 16,
    fontWeight: '600',
  },
  reviewActions: {
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  reviewWrap: {
    flex: 1,
    gap: 16,
    paddingHorizontal: 24,
    paddingBottom: 24,
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
  shutter: {
    backgroundColor: '#FFF7EA',
    borderColor: '#2B1607',
    borderRadius: 40,
    borderWidth: 4,
    height: 72,
    width: 72,
  },
  shutterDisabled: {
    opacity: 0.45,
  },
  spinner: {
    marginTop: 8,
  },
  status: {
    color: '#7C6E61',
    fontSize: 14,
    textAlign: 'center',
  },
  title: {
    color: '#2B1607',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
});
