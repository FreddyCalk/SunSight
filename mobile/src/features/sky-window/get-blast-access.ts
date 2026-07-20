import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { invokeEdgeFunction } from '@/lib/edge';
import type { SunsightClient } from '@/lib/supabase';

const blastAccessSchema = z
  .object({
    blastId: z.uuid(),
    kind: z.enum(['nudge', 'photo']),
    senderDisplayName: z.string().trim().min(1),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    mediaUrl: z.url().nullable(),
    mediaExpiresIn: z.number().int().positive().nullable(),
  })
  .superRefine((access, context) => {
    if (access.kind === 'photo' && !access.mediaUrl) {
      context.addIssue({
        code: 'custom',
        message: 'Photo access requires a media URL.',
        path: ['mediaUrl'],
      });
    }

    if (access.kind === 'nudge' && access.mediaUrl) {
      context.addIssue({
        code: 'custom',
        message: 'Nudge access cannot include media.',
        path: ['mediaUrl'],
      });
    }
  });

export type BlastAccess = z.infer<typeof blastAccessSchema>;

export async function getBlastAccess(
  client: SunsightClient,
  blastId: string,
): Promise<BlastAccess> {
  return invokeEdgeFunction(
    client,
    'get-blast-access',
    { blastId },
    blastAccessSchema,
  );
}

export const skyWindowAccessKeys = {
  all: ['sky-window-access'] as const,
  detail: (userId: string, blastId: string) =>
    [...skyWindowAccessKeys.all, 'user', userId, 'blast', blastId] as const,
};

export function skyWindowAccessQueryOptions(
  client: SunsightClient | null,
  userId: string,
  blastId: string,
) {
  return queryOptions({
    queryKey: skyWindowAccessKeys.detail(userId, blastId),
    queryFn: () => {
      if (!client) {
        throw new Error('Supabase is not configured.');
      }
      return getBlastAccess(client, blastId);
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
  });
}
