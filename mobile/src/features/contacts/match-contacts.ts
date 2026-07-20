import { z } from 'zod';

import { collectNormalizedContactNumbers } from '@/features/contacts/collect';
import { invokeEdgeFunction } from '@/lib/edge';
import type { SunsightClient } from '@/lib/supabase';

const matchContactsResponseSchema = z.object({
  synchronized: z.literal(true),
});

export type MatchContactsResult = z.infer<typeof matchContactsResponseSchema>;

/**
 * Sync consented contact matches. Clears the local numbers array after invoke.
 * Never logs the contact payload.
 */
export async function matchContacts(
  client: SunsightClient,
  consentedAt: string,
): Promise<MatchContactsResult> {
  const contacts = await collectNormalizedContactNumbers();

  try {
    return await invokeEdgeFunction(
      client,
      'match-contacts',
      {
        consented: true,
        consentedAt,
        contacts,
      },
      matchContactsResponseSchema,
    );
  } finally {
    contacts.fill('');
  }
}
