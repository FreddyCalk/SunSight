import { z } from "zod";
import { randomHex } from "../_shared/crypto.ts";
import { ApiError, handler, jsonResponse, parseJson } from "../_shared/http.ts";
import { validateAndDerive } from "../_shared/image.ts";
import { adminClient, authenticate, mapDatabaseError } from "../_shared/supabase.ts";

const schema = z.object({ blastId: z.uuid(), originalPath: z.string().max(300) }).strict();

Deno.serve(handler(async (request, id) => {
  const { client, user } = await authenticate(request);
  const body = await parseJson(request, schema);
  const expectedPrefix = `${user.id}/${body.blastId}/original-`;
  if (!body.originalPath.startsWith(expectedPrefix)) {
    throw new ApiError(404, "PHOTO_NOT_FOUND", "The uploaded photo was not found.");
  }

  const admin = adminClient();
  const { data: original, error: downloadError } = await admin.storage
    .from("sunset-photos")
    .download(body.originalPath);
  if (downloadError || !original) mapDatabaseError(downloadError ?? {});

  const derivatives = await validateAndDerive(original);
  const displayPath = `${user.id}/${body.blastId}/display-${randomHex()}.jpg`;
  const thumbnailPath = `${user.id}/${body.blastId}/thumbnail-${randomHex()}.jpg`;
  const bucket = admin.storage.from("sunset-photos");
  const [displayUpload, thumbnailUpload] = await Promise.all([
    bucket.upload(displayPath, derivatives.display, {
      contentType: "image/jpeg",
      cacheControl: "300",
      upsert: false,
    }),
    bucket.upload(thumbnailPath, derivatives.thumbnail, {
      contentType: "image/jpeg",
      cacheControl: "300",
      upsert: false,
    }),
  ]);
  if (displayUpload.error || thumbnailUpload.error) {
    await bucket.remove([displayPath, thumbnailPath]);
    mapDatabaseError(displayUpload.error ?? thumbnailUpload.error!);
  }

  const { data: recipientCount, error } = await client.rpc("complete_photo_blast", {
    p_blast_id: body.blastId,
    p_original_path: body.originalPath,
    p_display_path: displayPath,
    p_thumbnail_path: thumbnailPath,
  });
  if (error) {
    await bucket.remove([displayPath, thumbnailPath]);
    mapDatabaseError(error);
  }

  return jsonResponse(
    {
      blastId: body.blastId,
      status: "dispatching",
      recipientCount,
    },
    200,
    id,
  );
}));
