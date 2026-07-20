import { ApiError } from "./http.ts";

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  const sofMarkers = new Set([
    0xc0,
    0xc1,
    0xc2,
    0xc3,
    0xc5,
    0xc6,
    0xc7,
    0xc9,
    0xca,
    0xcb,
    0xcd,
    0xce,
    0xcf,
  ]);
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (offset + 2 > bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if (sofMarkers.has(marker)) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += length;
  }
  return null;
}

export async function validateAndDerive(
  blob: Blob,
): Promise<{ display: Uint8Array; thumbnail: Uint8Array }> {
  if (blob.size < 32 || blob.size > MAX_BYTES) {
    throw new ApiError(400, "INVALID_IMAGE", "The uploaded image is invalid.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const dimensions = blob.type === "image/jpeg"
    ? jpegDimensions(bytes)
    : blob.type === "image/png"
    ? pngDimensions(bytes)
    : null;
  if (!dimensions) {
    throw new ApiError(400, "INVALID_IMAGE", "The uploaded image is invalid.");
  }
  if (
    dimensions.width < 320 ||
    dimensions.height < 320 ||
    dimensions.width * dimensions.height > MAX_PIXELS
  ) {
    throw new ApiError(400, "INVALID_IMAGE", "The uploaded image dimensions are invalid.");
  }

  throw new ApiError(
    503,
    "MEDIA_PROCESSOR_UNAVAILABLE",
    "Photo processing is temporarily unavailable.",
  );
}
