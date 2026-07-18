import type { ZodType } from "zod";

export const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-worker-secret",
  "access-control-allow-methods": "POST, OPTIONS",
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function requestId(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[A-Za-z0-9_-]{8,80}$/.test(supplied)
    ? supplied
    : `req_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function jsonResponse(
  data: unknown,
  status: number,
  id: string,
): Response {
  return new Response(JSON.stringify({ data, error: null, requestId: id }), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

export function errorResponse(error: unknown, id: string): Response {
  const safe = error instanceof ApiError
    ? error
    : new ApiError(500, "INTERNAL_ERROR", "The request could not be completed.");
  if (!(error instanceof ApiError)) {
    console.error(JSON.stringify({ requestId: id, event: "request_failed" }));
  }
  return new Response(
    JSON.stringify({
      data: null,
      error: { code: safe.code, message: safe.message, requestId: id },
    }),
    {
      status: safe.status,
      headers: { ...corsHeaders, "content-type": "application/json" },
    },
  );
}

export async function parseJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 128_000) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The request is too large.");
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "A valid JSON body is required.");
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, "INVALID_REQUEST", "The request is malformed.");
  }
  return result.data;
}

export function handler(
  operation: (request: Request, id: string) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const id = requestId(request);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return errorResponse(
        new ApiError(405, "METHOD_NOT_ALLOWED", "Only POST is supported."),
        id,
      );
    }
    try {
      return await operation(request, id);
    } catch (error) {
      return errorResponse(error, id);
    }
  };
}
