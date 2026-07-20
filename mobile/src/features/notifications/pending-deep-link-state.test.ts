import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  loadPendingDeepLinkState,
  PENDING_DEEP_LINK_TTL_MS,
  resetPendingDeepLinkMemoryForTest,
  savePendingDeepLinkState,
  type PendingDeepLinkStorage,
} from './pending-deep-link-state.ts';

const PATH = '/sky/5e5f96e2-b7d8-4a1d-96d2-36126b5349a9' as const;

function memoryStorage(): PendingDeepLinkStorage {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
  };
}

describe('pending deep link state', () => {
  beforeEach(resetPendingDeepLinkMemoryForTest);

  it('restores a pending Sky Window after an in-memory restart', async () => {
    const storage = memoryStorage();
    await savePendingDeepLinkState(PATH, 1_000, storage);
    resetPendingDeepLinkMemoryForTest();

    assert.equal(await loadPendingDeepLinkState(2_000, storage), PATH);
  });

  it('drops an expired pending Sky Window', async () => {
    const storage = memoryStorage();
    await savePendingDeepLinkState(PATH, 1_000, storage);
    resetPendingDeepLinkMemoryForTest();

    assert.equal(
      await loadPendingDeepLinkState(1_000 + PENDING_DEEP_LINK_TTL_MS, storage),
      null,
    );
  });
});
