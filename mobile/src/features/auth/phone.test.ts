import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatUsCanadaNationalDisplay,
  formatUsCanadaNationalInput,
  isUsCanadaE164,
  normalizeUsCanadaE164,
} from './phone.ts';

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

describe('formatUsCanadaNationalInput', () => {
  it('formats progressively as digits are entered', () => {
    assert.equal(formatUsCanadaNationalInput('2'), '2');
    assert.equal(formatUsCanadaNationalInput('21'), '21');
    assert.equal(formatUsCanadaNationalInput('213'), '(213)');
    assert.equal(formatUsCanadaNationalInput('213373'), '(213) 373');
    assert.equal(formatUsCanadaNationalInput('2133734253'), '(213) 373-4253');
  });

  it('normalizes paste and messy input to the same national display', () => {
    const expected = '(213) 373-4253';
    assert.equal(formatUsCanadaNationalInput('(213)373-4253'), expected);
    assert.equal(formatUsCanadaNationalInput('2133734253'), expected);
    assert.equal(formatUsCanadaNationalInput('1 213 373 4253'), expected);
  });

  it('truncates over-length input to 10 national digits', () => {
    assert.equal(formatUsCanadaNationalInput('2133734253999'), '(213) 373-4253');
    assert.equal(formatUsCanadaNationalInput('12133734253'), '(213) 373-4253');
    assert.equal(formatUsCanadaNationalInput('12133734253999'), '(213) 373-4253');
  });

  it('round-trips through normalizeUsCanadaE164 to E.164', () => {
    assert.equal(
      normalizeUsCanadaE164(formatUsCanadaNationalInput('2133734253')),
      '+12133734253',
    );
  });
});

describe('formatUsCanadaNationalDisplay', () => {
  it('returns a national string with area, exchange, and subscriber parts', () => {
    const display = formatUsCanadaNationalDisplay('+12025550100');
    assert.match(display, /202/);
    assert.match(display, /555/);
    assert.match(display, /0100/);
  });
});
