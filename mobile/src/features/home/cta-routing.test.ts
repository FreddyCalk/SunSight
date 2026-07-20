import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CAPTURE_ROUTE,
  intentOpensCamera,
  resolveHomeCta,
} from './cta-routing.ts';

describe('resolveHomeCta', () => {
  it('routes Look up to confirm_nudge and never opens camera', () => {
    const intent = resolveHomeCta('look_up', false);
    assert.deepEqual(intent, { type: 'confirm_nudge' });
    assert.equal(intentOpensCamera(intent), false);
  });

  it('routes Capture to the capture placeholder route', () => {
    const intent = resolveHomeCta('capture', false);
    assert.deepEqual(intent, { type: 'navigate_capture', href: CAPTURE_ROUTE });
    assert.equal(intentOpensCamera(intent), true);
  });

  it('blocks both CTAs during shared cooldown', () => {
    assert.deepEqual(resolveHomeCta('look_up', true), { type: 'blocked_cooldown' });
    assert.deepEqual(resolveHomeCta('capture', true), { type: 'blocked_cooldown' });
    assert.equal(intentOpensCamera(resolveHomeCta('look_up', true)), false);
    assert.equal(intentOpensCamera(resolveHomeCta('capture', true)), false);
  });
});
