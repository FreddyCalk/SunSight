import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getAppVariant } from './app-identity.ts';

describe('getAppVariant', () => {
  it('prefers baked preview over env', () => {
    assert.equal(getAppVariant({ APP_VARIANT: 'production' }, 'preview'), 'preview');
  });

  it('prefers baked production over env', () => {
    assert.equal(getAppVariant({ APP_VARIANT: 'preview' }, 'production'), 'production');
  });

  it('falls back to env preview when baked is omitted', () => {
    assert.equal(getAppVariant({ APP_VARIANT: 'preview' }), 'preview');
  });

  it('defaults to production when baked and env are unset', () => {
    assert.equal(getAppVariant({}), 'production');
  });
});
