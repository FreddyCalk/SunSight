import { z } from "zod";
import { handler, jsonResponse, parseJson } from "../_shared/http.ts";
import { authenticate, mapDatabaseError } from "../_shared/supabase.ts";

const schema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
  accuracyM: z.number().positive().max(100_000),
  capturedAt: z.iso.datetime(),
  source: z.literal("foreground").default("foreground"),
}).strict();

Deno.serve(handler(async (request, id) => {
  const { client } = await authenticate(request);
  const body = await parseJson(request, schema);
  const { data, error } = await client.rpc("upsert_location_snapshot", {
    p_longitude: body.longitude,
    p_latitude: body.latitude,
    p_accuracy_m: body.accuracyM,
    p_captured_at: body.capturedAt,
    p_source: body.source,
  });
  if (error) mapDatabaseError(error);
  return jsonResponse(
    {
      capturedAt: data.captured_at,
      expiresAt: data.expires_at,
      accuracyM: data.accuracy_m,
    },
    200,
    id,
  );
}));
