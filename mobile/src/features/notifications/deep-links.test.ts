import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  notificationDataToSkyWindowPath,
  parseSkyWindowUrl,
} from './deep-links.ts';

const BLAST_ID = '5e5f96e2-b7d8-4a1d-96d2-36126b5349a9';

describe('notificationDataToSkyWindowPath', () => {
  it('maps the backend blast_id payload to the Sky Window', () => {
    assert.equal(
      notificationDataToSkyWindowPath({ blast_id: BLAST_ID }),
      `/sky/${BLAST_ID}`,
    );
  });

  it('accepts the camel-case payload used by older clients', () => {
    assert.equal(
      notificationDataToSkyWindowPath({ blastId: BLAST_ID }),
      `/sky/${BLAST_ID}`,
    );
  });

  it('rejects absent and malformed blast identifiers', () => {
    assert.equal(notificationDataToSkyWindowPath(undefined), null);
    assert.equal(notificationDataToSkyWindowPath({ blast_id: '../../settings' }), null);
    assert.equal(notificationDataToSkyWindowPath({ blast_id: '' }), null);
  });
});

describe('parseSkyWindowUrl', () => {
  it('parses production and preview schemes from APP_SCHEMES', () => {
    assert.equal(parseSkyWindowUrl(`sunsight://sky/${BLAST_ID}`), `/sky/${BLAST_ID}`);
    assert.equal(parseSkyWindowUrl(`sunsight:///sky/${BLAST_ID}`), `/sky/${BLAST_ID}`);
    assert.equal(
      parseSkyWindowUrl(`sunsight-preview://sky/${BLAST_ID}`),
      `/sky/${BLAST_ID}`,
    );
    assert.equal(
      parseSkyWindowUrl(`sunsight-preview:///sky/${BLAST_ID}`),
      `/sky/${BLAST_ID}`,
    );
  });

  it('rejects foreign schemes, routes, and extra segments', () => {
    assert.equal(parseSkyWindowUrl(`https://sky/${BLAST_ID}`), null);
    assert.equal(parseSkyWindowUrl(`mobile://sky/${BLAST_ID}`), null);
    assert.equal(parseSkyWindowUrl(`sunsight://settings/${BLAST_ID}`), null);
    assert.equal(parseSkyWindowUrl(`sunsight://sky/${BLAST_ID}/share`), null);
    assert.equal(
      parseSkyWindowUrl(`sunsight-preview://settings/${BLAST_ID}`),
      null,
    );
  });
});
