import { workerRequestSchema } from "../_shared/contracts.ts";
import { handler, jsonResponse, parseJson } from "../_shared/http.ts";
import { chunk, classifyTicket, type DeliveryResult } from "../_shared/push.ts";
import { adminClient, authenticateWorker, mapDatabaseError } from "../_shared/supabase.ts";

const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send";

type Device = { deviceId: string; deliveryId: string; pushToken: string };
type Claimed = {
  outbox_id: string;
  blast_id: string;
  kind: "nudge" | "photo";
  sender_display_name: string;
  attempt_count: number;
  devices: Device[];
};

Deno.serve(handler(async (request, id) => {
  authenticateWorker(request);
  const body = await parseJson(request, workerRequestSchema);
  const admin = adminClient();
  const { data, error } = await admin.rpc("claim_notification_outbox", {
    p_limit: body.limit,
  });
  if (error) mapDatabaseError(error);
  const claimed = (data ?? []) as Claimed[];

  let accepted = 0;
  let retried = 0;
  for (const item of claimed) {
    // Empty devices means no currently eligible enabled device. Orphaned
    // queued deliveries (state=queued, next_attempt_at null) are reclaimable
    // inside claim_notification_outbox and must not reach this branch.
    if (item.devices.length === 0) {
      const { error: finishError } = await admin.rpc("finish_notification_outbox", {
        p_outbox_id: item.outbox_id,
        p_results: [],
        p_retry: false,
        p_error_code: "NO_ENABLED_DEVICE",
      });
      if (finishError) mapDatabaseError(finishError);
      continue;
    }

    const allResults: DeliveryResult[] = [];
    let shouldRetry = false;
    for (const devices of chunk(item.devices, 100)) {
      const messages = devices.map((device) => ({
        to: device.pushToken,
        sound: "default",
        title: item.sender_display_name,
        body: item.kind === "photo"
          ? `${item.sender_display_name} caught the sunset near you`
          : `${item.sender_display_name} says look up`,
        data: { blast_id: item.blast_id },
        priority: "high",
      }));

      let response: Response;
      try {
        response = await fetch(EXPO_ENDPOINT, {
          method: "POST",
          headers: {
            "accept": "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(messages),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        shouldRetry = true;
        allResults.push(...devices.map((device) => ({
          deliveryId: device.deliveryId,
          state: "failed" as const,
          retry: true,
          errorCode: "PROVIDER_UNAVAILABLE",
        })));
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        shouldRetry = true;
        allResults.push(...devices.map((device) => ({
          deliveryId: device.deliveryId,
          state: "failed" as const,
          retry: true,
          errorCode: "PROVIDER_UNAVAILABLE",
        })));
        continue;
      }
      if (!response.ok) {
        allResults.push(...devices.map((device) => ({
          deliveryId: device.deliveryId,
          state: "failed" as const,
          retry: false,
          errorCode: "PROVIDER_REJECTED",
        })));
        continue;
      }

      let payload: { data?: unknown[] };
      try {
        payload = await response.json() as { data?: unknown[] };
      } catch {
        shouldRetry = true;
        allResults.push(...devices.map((device) => ({
          deliveryId: device.deliveryId,
          state: "failed" as const,
          retry: true,
          errorCode: "PROVIDER_INVALID_RESPONSE",
        })));
        continue;
      }
      if (!Array.isArray(payload.data) || payload.data.length !== devices.length) {
        shouldRetry = true;
        allResults.push(...devices.map((device) => ({
          deliveryId: device.deliveryId,
          state: "failed" as const,
          retry: true,
          errorCode: "PROVIDER_INVALID_RESPONSE",
        })));
        continue;
      }
      payload.data.forEach((ticket, index) => {
        const classified = classifyTicket(devices[index].deliveryId, ticket);
        allResults.push(classified.result);
        shouldRetry ||= classified.retry;
        if (classified.result.state === "accepted") accepted++;
      });
    }

    if (item.attempt_count >= 5) {
      shouldRetry = false;
      allResults.forEach((result) => {
        result.retry = false;
      });
    }
    const { error: finishError } = await admin.rpc("finish_notification_outbox", {
      p_outbox_id: item.outbox_id,
      p_results: allResults,
      p_retry: shouldRetry,
      p_error_code: shouldRetry ? "TRANSIENT_PROVIDER_FAILURE" : null,
    });
    if (finishError) mapDatabaseError(finishError);
    if (shouldRetry) retried++;
  }

  console.info(JSON.stringify({
    requestId: id,
    event: "dispatch_complete",
    claimed: claimed.length,
    accepted,
    retried,
  }));
  return jsonResponse({ claimed: claimed.length, accepted, retried }, 200, id);
}));
