import { z } from "zod";
import { randomHex } from "../_shared/crypto.ts";
import { handler, jsonResponse, parseJson } from "../_shared/http.ts";
import { adminClient, authenticate, mapDatabaseError } from "../_shared/supabase.ts";

const schema = z.object({
  kind: z.enum(["nudge", "photo"]),
  idempotencyKey: z.uuid(),
  expiresAt: z.iso.datetime(),
  timezone: z.string().min(1).max(80),
}).strict();

Deno.serve(handler(async (request, id) => {
  const { client, user } = await authenticate(request);
  const body = await parseJson(request, schema);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: body.timezone });
  } catch {
    return jsonResponse(null, 400, id);
  }

  const { data: blast, error } = await client.rpc("create_blast", {
    p_kind: body.kind,
    p_idempotency_key: body.idempotencyKey,
    p_expires_at: body.expiresAt,
  });
  if (error) mapDatabaseError(error);

  if (body.kind === "nudge") {
    const { data: recipientCount, error: selectionError } = await client.rpc(
      "select_and_persist_recipients",
      { p_blast_id: blast.id },
    );
    if (selectionError) mapDatabaseError(selectionError);
    return jsonResponse(
      {
        blastId: blast.id,
        kind: blast.kind,
        status: "dispatching",
        expiresAt: blast.expires_at,
        recipientCount,
      },
      200,
      id,
    );
  }

  if (blast.original_object_path) {
    return jsonResponse(
      {
        blastId: blast.id,
        kind: blast.kind,
        status: blast.status,
        expiresAt: blast.expires_at,
      },
      200,
      id,
    );
  }

  const extension = "jpg";
  const path = `${user.id}/${blast.id}/original-${randomHex()}.${extension}`;
  const { error: pathError } = await client.rpc("assign_photo_upload_path", {
    p_blast_id: blast.id,
    p_object_path: path,
  });
  if (pathError) mapDatabaseError(pathError);

  const { data: upload, error: uploadError } = await adminClient().storage
    .from("sunset-photos")
    .createSignedUploadUrl(path);
  if (uploadError) mapDatabaseError(uploadError);

  return jsonResponse(
    {
      blastId: blast.id,
      kind: blast.kind,
      status: "uploading",
      expiresAt: blast.expires_at,
      upload: { path, token: upload.token, signedUrl: upload.signedUrl },
    },
    201,
    id,
  );
}));
