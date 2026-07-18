import { z } from "zod";
import { ApiError, handler, jsonResponse, parseJson } from "../_shared/http.ts";
import { adminClient, authenticate, mapDatabaseError } from "../_shared/supabase.ts";

const schema = z.object({ blastId: z.uuid() }).strict();

Deno.serve(handler(async (request, id) => {
  const { client } = await authenticate(request);
  const body = await parseJson(request, schema);
  const { data, error } = await client.rpc("get_blast_access", {
    p_blast_id: body.blastId,
  });
  if (error) mapDatabaseError(error);
  const blast = Array.isArray(data) ? data[0] : data;
  if (!blast) {
    throw new ApiError(404, "BLAST_UNAVAILABLE", "This sunset alert is no longer available.");
  }

  let mediaUrl: string | null = null;
  let mediaExpiresIn: number | null = null;
  if (blast.kind === "photo") {
    if (!blast.display_object_path) {
      throw new ApiError(404, "BLAST_UNAVAILABLE", "This sunset alert is no longer available.");
    }
    const remaining = Math.floor((Date.parse(blast.expires_at) - Date.now()) / 1000);
    mediaExpiresIn = Math.max(1, Math.min(60, remaining));
    const { data: signed, error: signedError } = await adminClient().storage
      .from("sunset-photos")
      .createSignedUrl(blast.display_object_path, mediaExpiresIn);
    if (signedError) mapDatabaseError(signedError);
    mediaUrl = signed.signedUrl;
  }

  return jsonResponse(
    {
      blastId: blast.blast_id,
      kind: blast.kind,
      senderDisplayName: blast.sender_display_name,
      createdAt: blast.created_at,
      expiresAt: blast.expires_at,
      mediaUrl,
      mediaExpiresIn,
    },
    200,
    id,
  );
}));
