import { assert, assertEquals, assertRejects } from "@std/assert";
import { matchContactsSchema, workerRequestSchema } from "./contracts.ts";
import { ApiError, errorResponse, handler } from "./http.ts";
import { validateAndDerive } from "./image.ts";
import { classifyTicket } from "./push.ts";
import { authenticate, authenticateWorker } from "./supabase.ts";

Deno.test("contact matching accepts canonical bounded +1 E.164 input", () => {
  const result = matchContactsSchema.safeParse({
    consented: true,
    consentedAt: "2026-07-18T04:00:00.000Z",
    contacts: ["+12025550101"],
  });
  assert(result.success);
});

Deno.test("contact matching rejects malformed and over-cap input", () => {
  assert(
    !matchContactsSchema.safeParse({
      consented: true,
      consentedAt: "2026-07-18T04:00:00.000Z",
      contacts: ["2025550101"],
    }).success,
  );
  assert(
    !matchContactsSchema.safeParse({
      consented: true,
      consentedAt: "2026-07-18T04:00:00.000Z",
      contacts: Array(1001).fill("+12025550101"),
    }).success,
  );
});

Deno.test("worker input remains bounded", () => {
  assertEquals(workerRequestSchema.parse({}), { limit: 50 });
  assert(!workerRequestSchema.safeParse({ limit: 101 }).success);
});

Deno.test("safe errors do not expose sensitive exception text", async () => {
  const response = errorResponse(new Error("phone=+12025550101 token=secret"), "req_test123");
  const body = await response.text();
  assertEquals(response.status, 500);
  assert(!body.includes("+12025550101"));
  assert(!body.includes("secret"));
});

Deno.test("handler rejects missing user auth before operation", async () => {
  const wrapped = handler(async (request) => {
    await authenticate(request);
    throw new Error("authenticated operation must not run");
  });
  const response = await wrapped(
    new Request("http://localhost", {
      method: "POST",
      body: "{}",
    }),
  );
  assertEquals(response.status, 401);
});

Deno.test("worker authentication rejects absent secret", () => {
  Deno.env.set("DISPATCH_WORKER_SECRET", "a".repeat(32));
  let rejected = false;
  try {
    authenticateWorker(new Request("http://localhost"));
  } catch {
    rejected = true;
  }
  assert(rejected);
});

Deno.test("Expo retry and invalid-token classification is bounded", () => {
  assertEquals(
    classifyTicket("00000000-0000-0000-0000-000000000001", {
      status: "error",
      details: { error: "DeviceNotRegistered" },
    }),
    {
      result: {
        deliveryId: "00000000-0000-0000-0000-000000000001",
        state: "invalid_token",
        retry: false,
        errorCode: "DeviceNotRegistered",
      },
      retry: false,
    },
  );
  assert(
    classifyTicket("id", {
      status: "error",
      details: { error: "MessageRateExceeded" },
    }).retry,
  );
});

Deno.test("image adapter fails closed without a safe processor", async () => {
  const png = new Uint8Array(32);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  new DataView(png.buffer).setUint32(16, 320);
  new DataView(png.buffer).setUint32(20, 320);
  await assertRejects(
    () => validateAndDerive(new Blob([png.buffer], { type: "image/png" })),
    ApiError,
    "Photo processing is temporarily unavailable.",
  );
});
