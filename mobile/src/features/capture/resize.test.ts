import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { longestEdgeResize } from './resize.ts';

describe('longestEdgeResize', () => {
  it('constrains landscape images by width', () => {
    assert.deepEqual(longestEdgeResize(4032, 3024, 2048), { width: 2048 });
  });

  it('constrains portrait images by height', () => {
    assert.deepEqual(longestEdgeResize(3024, 4032, 2048), { height: 2048 });
  });

  it('does not upscale images already within the limit', () => {
    assert.equal(longestEdgeResize(1200, 2048, 2048), null);
  });
});
