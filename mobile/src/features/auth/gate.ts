import type { Session } from '@supabase/supabase-js';

import type { ProfileRow } from '@/queries/profile';

export type AuthGate =
  | { status: 'loading' }
  | { status: 'misconfigured' }
  | { status: 'unauthenticated' }
  | { status: 'profile_error'; session: Session }
  | { status: 'needs_privacy'; session: Session; profile: ProfileRow | null }
  | { status: 'ready'; session: Session; profile: ProfileRow }
  | { status: 'blocked'; session: Session; reason: 'suspended' | 'deleted' };

export function deriveAuthGate(input: {
  clientReady: boolean;
  session: Session | null;
  sessionLoading: boolean;
  profile: ProfileRow | null | undefined;
  profileLoading: boolean;
  profileError: boolean;
}): AuthGate {
  if (!input.clientReady) {
    return { status: 'misconfigured' };
  }

  if (input.sessionLoading) {
    return { status: 'loading' };
  }

  if (!input.session) {
    return { status: 'unauthenticated' };
  }

  if (input.profileLoading && input.profile === undefined) {
    return { status: 'loading' };
  }

  const profile = input.profile ?? null;

  if (input.profileError && input.profile === undefined) {
    return {
      status: 'profile_error',
      session: input.session,
    };
  }

  if (!profile || profile.status === 'pending') {
    return {
      status: 'needs_privacy',
      session: input.session,
      profile,
    };
  }

  if (profile.status === 'suspended' || profile.status === 'deleted') {
    return {
      status: 'blocked',
      session: input.session,
      reason: profile.status,
    };
  }

  if (profile.status === 'active') {
    return {
      status: 'ready',
      session: input.session,
      profile,
    };
  }

  return {
    status: 'needs_privacy',
    session: input.session,
    profile,
  };
}
