import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isUsCanadaE164, normalizeUsCanadaE164 } from './phone.ts';

describe('normalizeUsCanadaE164', () => {
  it('normalizes US national and E.164 forms', () => {
    assert.equal(normalizeUsCanadaE164('2025550100'), '+12025550100');
    assert.equal(normalizeUsCanadaE164('+12025550100'), '+12025550100');
    assert.equal(normalizeUsCanadaE164('(202) 555-0100'), '+12025550100');
    assert.equal(normalizeUsCanadaE164('1 202 555 0100'), '+12025550100');
  });

  it('accepts Canadian +1 numbers', () => {
    assert.equal(normalizeUsCanadaE164('+1 604 555 0100'), '+16045550100');
  });

  it('rejects empty, non-+1, and invalid inputs', () => {
    assert.equal(normalizeUsCanadaE164(''), null);
    assert.equal(normalizeUsCanadaE164('   '), null);
    assert.equal(normalizeUsCanadaE164('+442071838750'), null);
    assert.equal(normalizeUsCanadaE164('not-a-phone'), null);
  });
});

describe('isUsCanadaE164', () => {
  it('matches the backend +1 contract', () => {
    assert.equal(isUsCanadaE164('+12025550100'), true);
    assert.equal(isUsCanadaE164('+11025550100'), false);
    assert.equal(isUsCanadaE164('12025550100'), false);
  });
});
