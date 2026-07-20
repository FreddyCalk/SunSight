import { EdgeInvokeError } from '@/lib/edge';
import type { SunsightClient } from '@/lib/supabase';

const SUNSET_PHOTOS_BUCKET = 'sunset-photos';

/**
 * Upload a local JPEG file URI to the signed Storage path from create-blast.
 * Prefer file URI + Blob over base64 in React state.
 */
export async function uploadPhotoToSignedUrl(
  client: SunsightClient,
  params: {
    path: string;
    token: string;
    fileUri: string;
  },
): Promise<void> {
  const response = await fetch(params.fileUri);
  if (!response.ok) {
    throw new EdgeInvokeError('Could not read the prepared photo.', 'UPLOAD_READ_FAILED');
  }

  const blob = await response.blob();
  const { error } = await client.storage
    .from(SUNSET_PHOTOS_BUCKET)
    .uploadToSignedUrl(params.path, params.token, blob, {
      contentType: 'image/jpeg',
    });

  if (error) {
    throw new EdgeInvokeError(
      error.message || 'Photo upload failed. Try again.',
      'UPLOAD_FAILED',
    );
  }
}
