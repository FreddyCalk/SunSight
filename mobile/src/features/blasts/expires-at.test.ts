import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeBlastExpiresAt, nextLocalMidnightUtc } from './expires-at.ts';

describe('computeBlastExpiresAt', () => {
  it('uses the earlier of local midnight and four-hour visibility', () => {
    // 2026-07-17 22:00 UTC in America/Denver is still evening; midnight is sooner than +4h.
    const evening = new Date('2026-07-18T04:00:00.000Z');
    const { expiresAt, timezone } = computeBlastExpiresAt(evening, 'America/Denver');
    assert.equal(timezone, 'America/Denver');
    const midnight = nextLocalMidnightUtc(evening, 'America/Denver');
    const fourHours = new Date(evening.getTime() + 4 * 60 * 60 * 1000);
    const expected =
      midnight.getTime() < fourHours.getTime() ? midnight : fourHours;
    assert.equal(expiresAt, expected.toISOString());
  });

  it('caps at four hours when midnight is farther away', () => {
    const morning = new Date('2026-07-17T15:00:00.000Z'); // mid-morning Denver
    const { expiresAt } = computeBlastExpiresAt(morning, 'America/Denver');
    const fourHours = new Date(morning.getTime() + 4 * 60 * 60 * 1000);
    assert.equal(expiresAt, fourHours.toISOString());
  });
});
