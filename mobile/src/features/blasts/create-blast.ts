import { z } from 'zod';

import { computeBlastExpiresAt } from '@/features/blasts/expires-at';
import { invokeEdgeFunction } from '@/lib/edge';
import type { SunsightClient } from '@/lib/supabase';

const createBlastNudgeResponseSchema = z.object({
  blastId: z.uuid(),
  kind: z.literal('nudge'),
  status: z.enum(['dispatched', 'dispatching', 'ready', 'draft']),
  expiresAt: z.iso.datetime(),
  recipientCount: z.number().int().nonnegative().optional(),
});

const photoUploadSchema = z.object({
  path: z.string().min(1),
  token: z.string().min(1),
  signedUrl: z.string().min(1),
});

const createBlastPhotoResponseSchema = z.object({
  blastId: z.uuid(),
  kind: z.literal('photo'),
  status: z.enum(['uploading', 'dispatched', 'dispatching', 'ready', 'draft']),
  expiresAt: z.iso.datetime(),
  upload: photoUploadSchema.optional(),
  recipientCount: z.number().int().nonnegative().optional(),
});

const completePhotoUploadResponseSchema = z.object({
  blastId: z.uuid(),
  status: z.enum(['dispatched', 'dispatching']),
  recipientCount: z.number().int().nonnegative().optional(),
});

export type CreateNudgeBlastResult = z.infer<typeof createBlastNudgeResponseSchema>;
export type CreatePhotoBlastResult = z.infer<typeof createBlastPhotoResponseSchema>;
export type CompletePhotoUploadResult = z.infer<typeof completePhotoUploadResponseSchema>;

export type CreateBlastInput = {
  idempotencyKey: string;
  expiresAt?: string;
  timezone?: string;
};

export type CreateNudgeBlastInput = CreateBlastInput;

function resolveExpiry(input: CreateBlastInput): { expiresAt: string; timezone: string } {
  const computed = computeBlastExpiresAt();
  return {
    expiresAt: input.expiresAt ?? computed.expiresAt,
    timezone: input.timezone ?? computed.timezone,
  };
}

export async function createNudgeBlast(
  client: SunsightClient,
  input: CreateNudgeBlastInput,
): Promise<CreateNudgeBlastResult> {
  const { expiresAt, timezone } = resolveExpiry(input);

  return invokeEdgeFunction(
    client,
    'create-blast',
    {
      kind: 'nudge',
      idempotencyKey: input.idempotencyKey,
      expiresAt,
      timezone,
    },
    createBlastNudgeResponseSchema,
  );
}

export async function createPhotoBlast(
  client: SunsightClient,
  input: CreateBlastInput,
): Promise<CreatePhotoBlastResult> {
  const { expiresAt, timezone } = resolveExpiry(input);

  return invokeEdgeFunction(
    client,
    'create-blast',
    {
      kind: 'photo',
      idempotencyKey: input.idempotencyKey,
      expiresAt,
      timezone,
    },
    createBlastPhotoResponseSchema,
  );
}

export async function completePhotoUpload(
  client: SunsightClient,
  input: { blastId: string; originalPath: string },
): Promise<CompletePhotoUploadResult> {
  return invokeEdgeFunction(
    client,
    'complete-photo-upload',
    {
      blastId: input.blastId,
      originalPath: input.originalPath,
    },
    completePhotoUploadResponseSchema,
  );
}

export function mintBlastIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
