import * as SecureStore from 'expo-secure-store';

import type { SkyWindowPath } from './deep-links';
import {
  clearPendingDeepLinkState,
  loadPendingDeepLinkState,
  savePendingDeepLinkState,
} from './pending-deep-link-state';

export async function savePendingDeepLink(
  path: SkyWindowPath,
  nowMs = Date.now(),
): Promise<void> {
  await savePendingDeepLinkState(path, nowMs, SecureStore);
}

export async function loadPendingDeepLink(
  nowMs = Date.now(),
): Promise<SkyWindowPath | null> {
  return loadPendingDeepLinkState(nowMs, SecureStore);
}

export async function clearPendingDeepLink(): Promise<void> {
  await clearPendingDeepLinkState(SecureStore);
}
