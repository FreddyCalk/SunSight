import { matchContactsSchema } from "../_shared/contracts.ts";
import { hmacContacts } from "../_shared/crypto.ts";
import { handler, jsonResponse, parseJson } from "../_shared/http.ts";
import { authenticate, mapDatabaseError } from "../_shared/supabase.ts";

Deno.serve(handler(async (request, id) => {
  const { client } = await authenticate(request);
  const body = await parseJson(request, matchContactsSchema);
  const uniqueContacts = [...new Set(body.contacts)];
  body.contacts.fill("");
  const digests = await hmacContacts(uniqueContacts);
  uniqueContacts.fill("");

  const { error } = await client.rpc("replace_contact_matches", {
    p_contact_hmac_hex: digests,
    p_hmac_version: 1,
    p_consented_at: body.consentedAt,
  });
  digests.fill("");
  if (error) mapDatabaseError(error);
  return jsonResponse({ synchronized: true }, 200, id);
}));
