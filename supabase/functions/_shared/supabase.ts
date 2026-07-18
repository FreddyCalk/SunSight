import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ApiError } from "./http.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new ApiError(500, "SERVER_MISCONFIGURED", "The service is unavailable.");
  }
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function callerClient(request: Request): SupabaseClient {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function authenticate(request: Request): Promise<{
  client: SupabaseClient;
  user: User;
}> {
  const client = callerClient(request);
  const token = request.headers.get("authorization")!.slice("Bearer ".length);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new ApiError(401, "INVALID_TOKEN", "Authentication is required.");
  }
  return { client, user: data.user };
}

export function authenticateWorker(request: Request): void {
  const expected = env("DISPATCH_WORKER_SECRET");
  const supplied = request.headers.get("x-worker-secret") ?? "";
  const expectedBytes = new TextEncoder().encode(expected);
  const suppliedBytes = new TextEncoder().encode(supplied);
  let mismatch = expectedBytes.length ^ suppliedBytes.length;
  const length = Math.max(expectedBytes.length, suppliedBytes.length);
  for (let index = 0; index < length; index++) {
    mismatch |= (expectedBytes[index] ?? 0) ^ (suppliedBytes[index] ?? 0);
  }
  if (expectedBytes.length < 32 || mismatch !== 0) {
    throw new ApiError(401, "WORKER_AUTH_REQUIRED", "Worker authentication is required.");
  }
}

export function mapDatabaseError(error: unknown): never {
  const details = typeof error === "object" && error !== null
    ? error as { code?: string; hint?: string }
    : {};
  if (details.hint === "BLAST_RATE_LIMITED") {
    throw new ApiError(
      429,
      "BLAST_RATE_LIMITED",
      "Please wait before sending another sunset alert.",
    );
  }
  if (details.code === "P0002") {
    throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
  }
  if (details.code === "22023") {
    throw new ApiError(400, "INVALID_REQUEST", "The request is invalid.");
  }
  if (details.code === "28000" || details.code === "42501") {
    throw new ApiError(403, "FORBIDDEN", "The request is not authorized.");
  }
  throw new ApiError(409, "REQUEST_REJECTED", "The request could not be completed.");
}
