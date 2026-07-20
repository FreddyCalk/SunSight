import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveAuthGate } from './gate.ts';

const session = {
  access_token: 'token',
  refresh_token: 'refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'user-1' },
} as const;

describe('deriveAuthGate', () => {
  it('routes missing config and signed-out users', () => {
    assert.equal(
      deriveAuthGate({
        clientReady: false,
        session: null,
        sessionLoading: false,
        profile: undefined,
        profileLoading: false,
        profileError: false,
      }).status,
      'misconfigured',
    );

    assert.equal(
      deriveAuthGate({
        clientReady: true,
        session: null,
        sessionLoading: false,
        profile: undefined,
        profileLoading: false,
        profileError: false,
      }).status,
      'unauthenticated',
    );
  });

  it('gates pending profiles and admits active ones', () => {
    assert.equal(
      deriveAuthGate({
        clientReady: true,
        session: session as never,
        sessionLoading: false,
        profile: {
          id: 'user-1',
          display_name: null,
          status: 'pending',
          privacy_policy_version: null,
          privacy_policy_accepted_at: null,
        },
        profileLoading: false,
        profileError: false,
      }).status,
      'needs_privacy',
    );

    assert.equal(
      deriveAuthGate({
        clientReady: true,
        session: session as never,
        sessionLoading: false,
        profile: {
          id: 'user-1',
          display_name: null,
          status: 'active',
          privacy_policy_version: '2026-07-17',
          privacy_policy_accepted_at: '2026-07-17T00:00:00Z',
        },
        profileLoading: false,
        profileError: false,
      }).status,
      'ready',
    );
  });

  it('does not route a failed profile fetch through privacy onboarding', () => {
    assert.equal(
      deriveAuthGate({
        clientReady: true,
        session: session as never,
        sessionLoading: false,
        profile: undefined,
        profileLoading: false,
        profileError: true,
      }).status,
      'profile_error',
    );
  });
});
