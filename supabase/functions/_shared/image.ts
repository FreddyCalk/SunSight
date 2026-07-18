import { Image, ImageType } from "imagescript";
import { ApiError } from "./http.ts";

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

export async function validateAndDerive(
  blob: Blob,
): Promise<{ display: Uint8Array; thumbnail: Uint8Array }> {
  if (blob.size < 32 || blob.size > MAX_BYTES) {
    throw new ApiError(400, "INVALID_IMAGE", "The uploaded image is invalid.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const detected = ImageType.getType(bytes);
  if (
    !["image/jpeg", "image/png"].includes(blob.type) ||
    !detected ||
    !["jpeg", "png"].includes(detected)
  ) {
    throw new ApiError(400, "INVALID_IMAGE", "The uploaded image is invalid.");
  }

  let decoded: Image;
  try {
    decoded = await Image.decode(bytes);
  } catch {
    throw new ApiError(400, "INVALID_IMAGE", "The uploaded image is invalid.");
  }
  if (
    decoded.width < 320 ||
    decoded.height < 320 ||
    decoded.width * decoded.height > MAX_PIXELS
  ) {
    throw new ApiError(400, "INVALID_IMAGE", "The uploaded image dimensions are invalid.");
  }

  const displayImage = decoded.clone().contain(2048, 2048);
  const thumbnailImage = decoded.clone().cover(600, 600);
  const [display, thumbnail] = await Promise.all([
    displayImage.encodeJPEG(85),
    thumbnailImage.encodeJPEG(75),
  ]);
  return { display, thumbnail };
}
