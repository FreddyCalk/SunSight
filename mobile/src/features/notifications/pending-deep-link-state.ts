import type { SkyWindowPath } from './deep-links';

const STORAGE_KEY = 'sunsight.pending-sky-window';
export const PENDING_DEEP_LINK_TTL_MS = 15 * 60 * 1000;

type PendingDeepLink = {
  path: SkyWindowPath;
  expiresAt: number;
};

export type PendingDeepLinkStorage = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

let memoryPending: PendingDeepLink | null = null;

function parsePending(value: string | null): PendingDeepLink | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<PendingDeepLink>;
    if (
      typeof parsed.path === 'string' &&
      parsed.path.startsWith('/sky/') &&
      typeof parsed.expiresAt === 'number'
    ) {
      return parsed as PendingDeepLink;
    }
  } catch {
    return null;
  }
  return null;
}

export async function savePendingDeepLinkState(
  path: SkyWindowPath,
  nowMs: number,
  storage: PendingDeepLinkStorage,
): Promise<void> {
  memoryPending = { path, expiresAt: nowMs + PENDING_DEEP_LINK_TTL_MS };
  await storage.setItemAsync(STORAGE_KEY, JSON.stringify(memoryPending));
}

export async function loadPendingDeepLinkState(
  nowMs: number,
  storage: PendingDeepLinkStorage,
): Promise<SkyWindowPath | null> {
  const pending =
    memoryPending ?? parsePending(await storage.getItemAsync(STORAGE_KEY));
  if (!pending || pending.expiresAt <= nowMs) {
    memoryPending = null;
    await storage.deleteItemAsync(STORAGE_KEY);
    return null;
  }
  memoryPending = pending;
  return pending.path;
}

export async function clearPendingDeepLinkState(
  storage: PendingDeepLinkStorage,
): Promise<void> {
  memoryPending = null;
  await storage.deleteItemAsync(STORAGE_KEY);
}

export function resetPendingDeepLinkMemoryForTest(): void {
  memoryPending = null;
}
