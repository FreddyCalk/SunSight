import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapContactsForSend } from './consent-mapping.ts';

describe('mapContactsForSend', () => {
  it('requires permission before consent', () => {
    assert.deepEqual(mapContactsForSend('undetermined', false), {
      status: 'needs_permission',
    });
    assert.deepEqual(mapContactsForSend('denied', false), {
      status: 'denied_recoverable',
    });
    assert.deepEqual(mapContactsForSend('blocked', true), { status: 'blocked' });
  });

  it('requires matching consent after permission is granted', () => {
    assert.deepEqual(mapContactsForSend('granted', false), {
      status: 'needs_consent',
    });
    assert.deepEqual(mapContactsForSend('granted', true), { status: 'ready' });
  });
});
