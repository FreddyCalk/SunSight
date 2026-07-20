import * as SecureStore from 'expo-secure-store';

import {
  EMPTY_DRAFT,
  type CaptureDraftSnapshot,
} from '@/features/capture/draft-machine';

const DRAFT_KEY_PREFIX = 'sunsight.capture.draft.';

function draftKey(userId: string): string {
  return `${DRAFT_KEY_PREFIX}${userId}`;
}

type PersistedCaptureDraft = CaptureDraftSnapshot & {
  version: 1;
  userId: string;
  updatedAt: string;
};

function isDraftSnapshot(value: unknown): value is CaptureDraftSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const draft = value as Record<string, unknown>;
  return (
    (typeof draft.rawUri === 'string' || draft.rawUri === null) &&
    (typeof draft.preparedUri === 'string' || draft.preparedUri === null) &&
    (typeof draft.idempotencyKey === 'string' || draft.idempotencyKey === null) &&
    (typeof draft.blastId === 'string' || draft.blastId === null) &&
    (typeof draft.uploadPath === 'string' || draft.uploadPath === null) &&
    typeof draft.uploaded === 'boolean'
  );
}

/**
 * Persist capture draft metadata (file URIs + keys only — never image bytes).
 */
export async function loadCaptureDraft(
  userId: string,
): Promise<CaptureDraftSnapshot | null> {
  if (!(await SecureStore.isAvailableAsync())) {
    return null;
  }

  const raw = await SecureStore.getItemAsync(draftKey(userId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedCaptureDraft;
    if (parsed.version !== 1 || parsed.userId !== userId || !isDraftSnapshot(parsed)) {
      return null;
    }
    if (!parsed.rawUri) {
      return null;
    }
    return {
      rawUri: parsed.rawUri,
      preparedUri: parsed.preparedUri,
      idempotencyKey: parsed.idempotencyKey,
      blastId: parsed.blastId,
      uploadPath: parsed.uploadPath,
      uploaded: parsed.uploaded,
    };
  } catch {
    return null;
  }
}

export async function saveCaptureDraft(
  userId: string,
  draft: CaptureDraftSnapshot,
): Promise<void> {
  if (!draft.rawUri) {
    await clearCaptureDraft(userId);
    return;
  }

  if (!(await SecureStore.isAvailableAsync())) {
    return;
  }

  const payload: PersistedCaptureDraft = {
    version: 1,
    userId,
    updatedAt: new Date().toISOString(),
    ...draft,
  };
  await SecureStore.setItemAsync(draftKey(userId), JSON.stringify(payload));
}

export async function clearCaptureDraft(userId: string): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    return;
  }
  await SecureStore.deleteItemAsync(draftKey(userId));
}

export function emptyCaptureDraft(): CaptureDraftSnapshot {
  return { ...EMPTY_DRAFT };
}
