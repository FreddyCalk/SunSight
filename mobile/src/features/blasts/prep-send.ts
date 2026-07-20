import { classifyBlastError } from '@/features/blasts/errors';
import {
  getContactsMatchingConsent,
  saveContactsMatchingConsent,
} from '@/features/contacts/consent';
import { mapContactsForSend } from '@/features/contacts/consent-mapping';
import { matchContacts } from '@/features/contacts/match-contacts';
import { upsertForegroundLocationIfAllowed } from '@/features/location/upsert-location';
import {
  getContactsPermissionState,
  requestContactsPermission,
} from '@/features/permissions/contacts';
import {
  getLocationPermissionState,
  requestLocationPermission,
} from '@/features/permissions/location';
import type { SunsightClient } from '@/lib/supabase';

export type BlastPrepFailure = {
  ok: false;
  phase: 'contacts' | 'location' | 'retryable_error' | 'terminal_error';
  message: string;
  code?: string;
};

export type BlastPrepPrompts = {
  requestContactsConsent: () => Promise<boolean>;
};

/**
 * Shared Look up / Capture prerequisites: contacts consent+match, then location.
 */
export async function ensureBlastPrerequisites(
  client: SunsightClient,
  userId: string,
  prompts: BlastPrepPrompts,
): Promise<{ ok: true } | BlastPrepFailure> {
  const contactsPrep = await ensureContactsReady(client, userId, prompts);
  if (!contactsPrep.ok) {
    return contactsPrep;
  }

  return ensureLocationReady(client);
}

async function ensureContactsReady(
  client: SunsightClient,
  userId: string,
  prompts: BlastPrepPrompts,
): Promise<{ ok: true } | BlastPrepFailure> {
  let permission = await getContactsPermissionState();
  let consent = await getContactsMatchingConsent(userId);
  let readiness = mapContactsForSend(permission, Boolean(consent));

  if (readiness.status === 'blocked') {
    return {
      ok: false,
      phase: 'contacts',
      message:
        'Contacts access is turned off. Open Permissions or Settings so Sunsight can find people nearby.',
      code: 'CONTACTS_BLOCKED',
    };
  }

  if (readiness.status === 'needs_permission' || readiness.status === 'denied_recoverable') {
    permission = await requestContactsPermission();
    readiness = mapContactsForSend(permission, Boolean(consent));
    if (readiness.status === 'blocked' || readiness.status === 'denied_recoverable') {
      return {
        ok: false,
        phase: 'contacts',
        message:
          'Contacts permission is required so Sunsight can reach people in your address book who use the app.',
        code: 'CONTACTS_PERMISSION',
      };
    }
    if (readiness.status === 'needs_permission') {
      return {
        ok: false,
        phase: 'contacts',
        message: 'Contacts permission is required before sending.',
        code: 'CONTACTS_PERMISSION',
      };
    }
  }

  if (readiness.status === 'needs_consent') {
    const accepted = await prompts.requestContactsConsent();
    if (!accepted) {
      return {
        ok: false,
        phase: 'contacts',
        message: 'Contact matching consent is required before the first send.',
        code: 'CONTACTS_CONSENT',
      };
    }
    consent = await saveContactsMatchingConsent(userId);
    readiness = mapContactsForSend(permission, true);
  }

  if (readiness.status !== 'ready' || !consent) {
    return {
      ok: false,
      phase: 'contacts',
      message: 'Contact matching is not ready.',
      code: 'CONTACTS_NOT_READY',
    };
  }

  try {
    await matchContacts(client, consent.consentedAt);
  } catch (error) {
    const classified = classifyBlastError(error);
    return {
      ok: false,
      phase: classified.kind === 'terminal' ? 'terminal_error' : 'retryable_error',
      message: classified.message,
      code: classified.code,
    };
  }

  return { ok: true };
}

async function ensureLocationReady(
  client: SunsightClient,
): Promise<{ ok: true } | BlastPrepFailure> {
  let permission = await getLocationPermissionState();
  if (permission === 'undetermined' || permission === 'denied') {
    permission = await requestLocationPermission();
  }

  if (permission !== 'granted') {
    return {
      ok: false,
      phase: 'location',
      message:
        'Location is required to send a nearby alert. Enable it in Permissions or Settings.',
      code: 'LOCATION_PERMISSION',
    };
  }

  const snapshot = await upsertForegroundLocationIfAllowed(client);
  if (!snapshot) {
    return {
      ok: false,
      phase: 'location',
      message: 'Could not refresh your location. Move outdoors or try again.',
      code: 'LOCATION_UNAVAILABLE',
    };
  }

  return { ok: true };
}
