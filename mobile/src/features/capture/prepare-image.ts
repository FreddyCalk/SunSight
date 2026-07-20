import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

import { longestEdgeResize } from './resize';

/** Longest edge after client resize — keeps uploads under server byte/pixel limits. */
export const CAPTURE_MAX_EDGE_PX = 2048;

/** JPEG quality for upload. Re-encoding may drop some EXIF; full strip is server-side. */
export const CAPTURE_JPEG_COMPRESS = 0.82;

export type PreparedCaptureImage = {
  uri: string;
  width: number;
  height: number;
};

/**
 * Resize and re-encode as JPEG to a new file URI (no base64).
 * Re-encoding can strip or alter EXIF depending on platform, but this is not a
 * guarantee of full metadata removal — the server remains authoritative.
 */
export async function prepareCaptureImage(
  sourceUri: string,
): Promise<PreparedCaptureImage> {
  const dimensions = await Image.getSize(sourceUri);
  const resize = longestEdgeResize(
    dimensions.width,
    dimensions.height,
    CAPTURE_MAX_EDGE_PX,
  );
  const result = await manipulateAsync(
    sourceUri,
    resize ? [{ resize }] : [],
    {
      compress: CAPTURE_JPEG_COMPRESS,
      format: SaveFormat.JPEG,
      base64: false,
    },
  );

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}
