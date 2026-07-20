import {
  FunctionsHttpError,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '@sunsight/database-types';

const edgeEnvelopeSchema = z.object({
  data: z.unknown(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
    })
    .nullable(),
  requestId: z.string(),
});

export class EdgeInvokeError extends Error {
  readonly code: string;

  constructor(message: string, code: string = 'EDGE_INVOKE_FAILED') {
    super(message);
    this.name = 'EdgeInvokeError';
    this.code = code;
  }
}

async function parseHttpError(error: unknown): Promise<EdgeInvokeError | null> {
  if (!(error instanceof FunctionsHttpError)) {
    return null;
  }

  try {
    const body = await error.context.json();
    const envelope = edgeEnvelopeSchema.safeParse(body);
    if (envelope.success && envelope.data.error) {
      return new EdgeInvokeError(
        envelope.data.error.message,
        envelope.data.error.code,
      );
    }
  } catch {
    return null;
  }

  return null;
}

export async function invokeEdgeFunction<T>(
  client: SupabaseClient<Database>,
  functionName: string,
  body: Record<string, unknown>,
  dataSchema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await client.functions.invoke(functionName, { body });

  if (error) {
    const parsedError = await parseHttpError(error);
    if (parsedError) {
      throw parsedError;
    }
    throw new EdgeInvokeError('The request could not be completed.');
  }

  const envelope = edgeEnvelopeSchema.safeParse(data);
  if (!envelope.success) {
    throw new EdgeInvokeError('The request could not be completed.', 'INVALID_RESPONSE');
  }

  if (envelope.data.error) {
    throw new EdgeInvokeError(envelope.data.error.message, envelope.data.error.code);
  }

  const parsed = dataSchema.safeParse(envelope.data.data);
  if (!parsed.success) {
    throw new EdgeInvokeError('The request could not be completed.', 'INVALID_RESPONSE');
  }

  return parsed.data;
}
