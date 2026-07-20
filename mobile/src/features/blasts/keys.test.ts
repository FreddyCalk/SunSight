import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { blastKeys } from './keys.ts';

describe('blastKeys', () => {
  it('scopes detail and cooldown under the user', () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const blastId = '22222222-2222-2222-2222-222222222222';

    assert.deepEqual(blastKeys.all, ['blasts']);
    assert.deepEqual(blastKeys.byUser(userId), ['blasts', 'user', userId]);
    assert.deepEqual(blastKeys.detail(userId, blastId), [
      'blasts',
      'user',
      userId,
      'detail',
      blastId,
    ]);
    assert.deepEqual(blastKeys.cooldown(userId), [
      'blasts',
      'user',
      userId,
      'cooldown',
    ]);
  });

  it('isolates cooldown keys between users', () => {
    const a = blastKeys.cooldown('user-a');
    const b = blastKeys.cooldown('user-b');
    assert.notDeepEqual(a, b);
  });
});
