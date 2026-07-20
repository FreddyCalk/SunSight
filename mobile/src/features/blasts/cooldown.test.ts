import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  activeCooldownMessage,
  createCooldownState,
  SHARED_COOLDOWN_MESSAGE,
} from './cooldown.ts';

describe('shared blast cooldown', () => {
  it('arms a cooldown after a successful Look up or Capture', () => {
    assert.deepEqual(createCooldownState(1_000, 30_000), {
      untilMs: 31_000,
      message: SHARED_COOLDOWN_MESSAGE,
    });
  });

  it('blocks Capture only while the shared cooldown is active', () => {
    const state = createCooldownState(1_000, 30_000, 'Wait for the next sky.');
    assert.equal(activeCooldownMessage(state, 30_999), 'Wait for the next sky.');
    assert.equal(activeCooldownMessage(state, 31_000), null);
    assert.equal(activeCooldownMessage(null, 2_000), null);
  });
});
