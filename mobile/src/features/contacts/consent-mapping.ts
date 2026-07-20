import type { AppPermissionState } from '@/features/permissions/map-status';

export type ContactsSendReadiness =
  | { status: 'ready' }
  | { status: 'needs_permission' }
  | { status: 'needs_consent' }
  | { status: 'denied_recoverable' }
  | { status: 'blocked' };

/**
 * Map OS contacts permission + in-app matching consent into send readiness.
 * Consent is required before the first match-contacts call; permission alone is not enough.
 */
export function mapContactsForSend(
  permission: AppPermissionState,
  hasMatchingConsent: boolean,
): ContactsSendReadiness {
  if (permission === 'blocked') {
    return { status: 'blocked' };
  }

  if (permission === 'undetermined' || permission === 'denied') {
    return permission === 'denied'
      ? { status: 'denied_recoverable' }
      : { status: 'needs_permission' };
  }

  if (!hasMatchingConsent) {
    return { status: 'needs_consent' };
  }

  return { status: 'ready' };
}
