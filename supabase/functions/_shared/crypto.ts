import { ApiError } from "./http.ts";

export async function hmacContacts(contacts: string[]): Promise<string[]> {
  const secret = Deno.env.get("PHONE_HMAC_SECRET");
  if (!secret || new TextEncoder().encode(secret).byteLength < 32) {
    throw new ApiError(500, "SERVER_MISCONFIGURED", "The service is unavailable.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digests: string[] = [];
  for (const contact of contacts) {
    const bytes = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(contact)),
    );
    digests.push(Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""));
  }
  return digests;
}

export function randomHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
