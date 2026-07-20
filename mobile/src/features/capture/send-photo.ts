import { classifyBlastError } from '@/features/blasts/errors';
import {
  completePhotoUpload,
  createPhotoBlast,
  mintBlastIdempotencyKey,
  type CompletePhotoUploadResult,
} from '@/features/blasts/create-blast';
import {
  ensureBlastPrerequisites,
  type BlastPrepPrompts,
} from '@/features/blasts/prep-send';
import {
  resolveIdempotencyKeyForConfirm,
  type CaptureDraftSnapshot,
  type CaptureSendStep,
} from '@/features/capture/draft-machine';
import { prepareCaptureImage } from '@/features/capture/prepare-image';
import { uploadPhotoToSignedUrl } from '@/features/capture/upload-photo';
import type { SunsightClient } from '@/lib/supabase';

export type PhotoSendResult =
  | { ok: true; blast: CompletePhotoUploadResult; draft: CaptureDraftSnapshot }
  | {
      ok: false;
      phase: 'contacts' | 'location' | 'cooldown' | 'retryable_error' | 'terminal_error';
      message: string;
      code?: string;
      draft: CaptureDraftSnapshot;
    };

export type PhotoSendProgress = (step: CaptureSendStep) => void;

export type PhotoSendOptions = {
  draft: CaptureDraftSnapshot;
  onProgress?: PhotoSendProgress;
  /** When set, reused instead of minting — same attempt after interrupt/retry. */
  idempotencyKey?: string;
};

/**
 * Capture send path after confirm:
 * mint/reuse idempotency key → prepare JPEG → contacts/location →
 * create-blast photo → signed upload → complete-photo-upload.
 */
export async function sendPhotoBlast(
  client: SunsightClient,
  userId: string,
  prompts: BlastPrepPrompts,
  options: PhotoSendOptions,
): Promise<PhotoSendResult> {
  if (!options.draft.rawUri) {
    return {
      ok: false,
      phase: 'terminal_error',
      message: 'No photo to send. Take a picture first.',
      code: 'NO_PHOTO',
      draft: options.draft,
    };
  }

  const rawUri = options.draft.rawUri;

  let draft: CaptureDraftSnapshot = {
    ...options.draft,
    rawUri,
    idempotencyKey: resolveIdempotencyKeyForConfirm(
      options.idempotencyKey ?? options.draft.idempotencyKey,
      mintBlastIdempotencyKey,
    ),
  };

  const report = (step: CaptureSendStep) => {
    options.onProgress?.(step);
  };

  try {
    report('preparing');
    if (!draft.preparedUri) {
      const prepared = await prepareCaptureImage(rawUri);
      draft = { ...draft, preparedUri: prepared.uri };
    }

    const prep = await ensureBlastPrerequisites(client, userId, prompts);
    if (!prep.ok) {
      return { ...prep, draft };
    }

    report('creating');
    const created = await createPhotoBlast(client, {
      idempotencyKey: draft.idempotencyKey!,
    });

    draft = {
      ...draft,
      blastId: created.blastId,
      uploadPath: created.upload?.path ?? draft.uploadPath,
    };

    if (
      created.status === 'dispatched' ||
      created.status === 'dispatching' ||
      created.status === 'ready'
    ) {
      return {
        ok: true,
        blast: {
          blastId: created.blastId,
          status: created.status === 'dispatched' ? 'dispatched' : 'dispatching',
          recipientCount: created.recipientCount,
        },
        draft,
      };
    }

    if (!created.upload && !draft.uploaded) {
      return {
        ok: false,
        phase: 'retryable_error',
        message: 'Upload credentials were missing. Try again.',
        code: 'UPLOAD_CREDENTIALS_MISSING',
        draft,
      };
    }

    if (!draft.uploaded && created.upload && draft.preparedUri) {
      report('uploading');
      await uploadPhotoToSignedUrl(client, {
        path: created.upload.path,
        token: created.upload.token,
        fileUri: draft.preparedUri,
      });
      draft = {
        ...draft,
        uploadPath: created.upload.path,
        uploaded: true,
      };
    }

    if (!draft.blastId || !draft.uploadPath) {
      return {
        ok: false,
        phase: 'retryable_error',
        message: 'Photo blast is incomplete. Try again.',
        code: 'BLAST_INCOMPLETE',
        draft,
      };
    }

    report('completing');
    const completed = await completePhotoUpload(client, {
      blastId: draft.blastId,
      originalPath: draft.uploadPath,
    });

    return { ok: true, blast: completed, draft };
  } catch (error) {
    const classified = classifyBlastError(error);
    if (classified.kind === 'cooldown') {
      return {
        ok: false,
        phase: 'cooldown',
        message: classified.message,
        code: classified.code,
        draft,
      };
    }
    if (classified.kind === 'terminal') {
      return {
        ok: false,
        phase: 'terminal_error',
        message: classified.message,
        code: classified.code,
        draft,
      };
    }
    return {
      ok: false,
      phase: 'retryable_error',
      message: classified.message,
      code: classified.code,
      draft,
    };
  }
}
