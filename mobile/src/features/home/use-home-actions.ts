import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { classifyBlastError } from '@/features/blasts/errors';
import {
  createCooldownState,
  SHARED_COOLDOWN_MESSAGE,
} from '@/features/blasts/cooldown';
import {
  blastKeys,
  type BlastCooldownState,
} from '@/features/blasts/keys';
import { CONTACTS_MATCHING_DISCLOSURE } from '@/features/contacts/consent';
import { resolveHomeCta, type HomeCta } from '@/features/home/cta-routing';
import { sendNudgeBlast } from '@/features/home/send-nudge';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  getNotificationsPermissionState,
  NOTIFICATIONS_PERMISSION_RATIONALE,
} from '@/features/permissions/notifications';
import { requireSupabase } from '@/lib/supabase';

/** Client estimate aligned with locked MVP `blast_cooldown_seconds` (server is authoritative). */
export const CLIENT_COOLDOWN_MS = 30 * 60 * 1000;

function promptConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Send', onPress: () => resolve(true) },
    ]);
  });
}

function promptConsent(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert('Find people nearby', CONTACTS_MATCHING_DISCLOSURE, [
      { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Allow matching', onPress: () => resolve(true) },
    ]);
  });
}

export function useHomeActions() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();
  const retryKeyRef = useRef<string | undefined>(undefined);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const cooldownQuery = useQuery({
    queryKey: blastKeys.cooldown(userId || 'anonymous'),
    queryFn: async (): Promise<BlastCooldownState | null> => null,
    enabled: Boolean(userId),
    staleTime: Infinity,
    initialData: null as BlastCooldownState | null,
  });

  const cooldownActive = Boolean(
    cooldownQuery.data && cooldownQuery.data.untilMs > nowMs,
  );

  useEffect(() => {
    if (!cooldownQuery.data) {
      return;
    }
    const remaining = cooldownQuery.data.untilMs - Date.now();
    const delay = remaining <= 0 ? 0 : Math.min(remaining, 30_000);
    const timer = setTimeout(() => setNowMs(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [cooldownQuery.data]);

  const setCooldown = useCallback(
    (message: string) => {
      if (!userId) {
        return;
      }
      const state: BlastCooldownState = createCooldownState(
        Date.now(),
        CLIENT_COOLDOWN_MS,
        message,
      );
      queryClient.setQueryData(blastKeys.cooldown(userId), state);
      setNowMs(Date.now());
      setStatusMessage(message);
    },
    [queryClient, userId],
  );

  const nudgeMutation = useMutation({
    mutationFn: async () => {
      const client = requireSupabase();
      if (!userId) {
        throw new Error('Sign in to send a Look up.');
      }
      const notificationsGranted =
        (await getNotificationsPermissionState().catch(() => 'denied')) ===
        'granted';
      return sendNudgeBlast(
        client,
        userId,
        {
          confirmSend: () =>
            promptConfirm(
              'Look up',
              [
                'Send a nearby nudge that the sky is happening? This will not open the camera.',
                notificationsGranted ? null : NOTIFICATIONS_PERMISSION_RATIONALE,
              ]
                .filter(Boolean)
                .join('\n\n'),
            ),
          requestContactsConsent: promptConsent,
        },
        { idempotencyKey: retryKeyRef.current },
      );
    },
    onSuccess: (result) => {
      if (result.ok) {
        retryKeyRef.current = undefined;
        queryClient.setQueryData(blastKeys.detail(userId, result.blast.blastId), result.blast);
        setCooldown(SHARED_COOLDOWN_MESSAGE);
        return;
      }

      if (result.code === 'CANCELLED') {
        setStatusMessage(null);
        return;
      }

      if (result.idempotencyKey) {
        retryKeyRef.current = result.idempotencyKey;
      }

      if (result.phase === 'cooldown') {
        setCooldown(result.message);
        return;
      }

      setStatusMessage(result.message);
    },
    onError: (error) => {
      const classified = classifyBlastError(error);
      if (classified.kind === 'cooldown') {
        setCooldown(classified.message);
        return;
      }
      setStatusMessage(classified.message);
    },
  });

  const onCtaPress = useCallback(
    (cta: HomeCta) => {
      const intent = resolveHomeCta(cta, cooldownActive);
      if (intent.type === 'blocked_cooldown') {
        setStatusMessage(
          cooldownQuery.data?.message ??
            'Please wait before sending another sunset alert.',
        );
        return;
      }
      if (intent.type === 'navigate_capture') {
        router.push(intent.href);
        return;
      }
      setStatusMessage(null);
      nudgeMutation.mutate();
    },
    [cooldownActive, cooldownQuery.data?.message, nudgeMutation, router],
  );

  const busy = nudgeMutation.isPending;

  const status = useMemo(() => {
    if (cooldownActive) {
      return (
        cooldownQuery.data?.message ??
        'Please wait before sending another sunset alert.'
      );
    }
    if (busy) {
      return 'Sending Look up…';
    }
    return statusMessage;
  }, [busy, cooldownActive, cooldownQuery.data?.message, statusMessage]);

  return {
    cooldownActive,
    busy,
    status,
    onLookUp: () => onCtaPress('look_up'),
    onCapture: () => onCtaPress('capture'),
    retryLookUp: () => {
      if (cooldownActive) {
        return;
      }
      nudgeMutation.mutate();
    },
  };
}
