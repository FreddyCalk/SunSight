import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapPermissionResponse, mapPermissionStatus } from './map-status.ts';

describe('mapPermissionStatus', () => {
  it('maps granted and undetermined', () => {
    assert.equal(mapPermissionStatus('granted', true), 'granted');
    assert.equal(mapPermissionStatus('undetermined', true), 'undetermined');
  });

  it('maps denied vs blocked from canAskAgain', () => {
    assert.equal(mapPermissionStatus('denied', true), 'denied');
    assert.equal(mapPermissionStatus('denied', false), 'blocked');
  });
});

describe('mapPermissionResponse', () => {
  it('treats granted flag as granted', () => {
    assert.equal(
      mapPermissionResponse({
        status: 'denied',
        granted: true,
        canAskAgain: true,
      }),
      'granted',
    );
  });
});
