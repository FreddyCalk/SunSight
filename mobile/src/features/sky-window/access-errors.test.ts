import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapSkyWindowAccessError } from './access-errors.ts';

describe('mapSkyWindowAccessError', () => {
  it('maps expired, unauthorized, and missing blasts to the calm unavailable state', () => {
    assert.equal(mapSkyWindowAccessError({ code: 'BLAST_UNAVAILABLE' }), 'unavailable');
    assert.equal(mapSkyWindowAccessError({ code: 'FORBIDDEN' }), 'unavailable');
    assert.equal(mapSkyWindowAccessError({ code: 'NOT_FOUND' }), 'unavailable');
  });

  it('maps missing or expired sessions to the auth state', () => {
    assert.equal(mapSkyWindowAccessError({ code: 'AUTH_REQUIRED' }), 'auth');
    assert.equal(mapSkyWindowAccessError({ code: 'INVALID_TOKEN' }), 'auth');
  });

  it('keeps network and malformed response failures retryable', () => {
    assert.equal(mapSkyWindowAccessError({ code: 'EDGE_INVOKE_FAILED' }), 'retryable');
    assert.equal(mapSkyWindowAccessError(new Error('offline')), 'retryable');
    assert.equal(mapSkyWindowAccessError(null), 'retryable');
  });
});
