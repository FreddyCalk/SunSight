export type DeliveryResult = {
  deliveryId: string;
  state: "accepted" | "failed" | "invalid_token";
  retry: boolean;
  receiptId?: string;
  errorCode?: string;
};

type ExpoTicket = {
  status?: string;
  id?: string;
  details?: { error?: string };
};

export function classifyTicket(deliveryId: string, value: unknown): {
  result: DeliveryResult;
  retry: boolean;
} {
  const ticket = typeof value === "object" && value !== null ? value as ExpoTicket : {};
  if (ticket.status === "ok" && ticket.id) {
    return {
      result: { deliveryId, state: "accepted", retry: false, receiptId: ticket.id },
      retry: false,
    };
  }
  const code = ticket.details?.error ?? "EXPO_REJECTED";
  if (code === "DeviceNotRegistered") {
    return {
      result: { deliveryId, state: "invalid_token", retry: false, errorCode: code },
      retry: false,
    };
  }
  const retry = code === "MessageRateExceeded" || code === "ExpoServerError";
  return { result: { deliveryId, state: "failed", retry, errorCode: code }, retry };
}

export function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
