import { z } from "zod";
import { handler, jsonResponse, parseJson } from "../_shared/http.ts";
import { authenticate, mapDatabaseError } from "../_shared/supabase.ts";

const schema = z.object({
  pushToken: z.string().regex(/^ExponentPushToken\[[A-Za-z0-9_-]+\]$/).max(200),
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().min(1).max(80).optional(),
}).strict();

Deno.serve(handler(async (request, id) => {
  const { client } = await authenticate(request);
  const body = await parseJson(request, schema);
  const { data: deviceId, error } = await client.rpc("register_device", {
    p_push_token: body.pushToken,
    p_platform: body.platform,
    p_app_version: body.appVersion ?? null,
  });
  if (error) mapDatabaseError(error);
  return jsonResponse({ deviceId }, 200, id);
}));
