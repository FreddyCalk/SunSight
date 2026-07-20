import * as Contacts from 'expo-contacts';

import { normalizeUsCanadaE164 } from '@/features/auth/phone';

/** Matches Edge `match-contacts` payload cap. */
export const MATCH_CONTACTS_MAX = 1000;

/**
 * Collect unique normalized +1 US/Canada numbers from device contacts.
 * Caps at MATCH_CONTACTS_MAX. Does not log or persist raw values.
 */
export async function collectNormalizedContactNumbers(
  max: number = MATCH_CONTACTS_MAX,
): Promise<string[]> {
  const seen = new Set<string>();
  const numbers: string[] = [];
  let pageOffset = 0;
  const pageSize = 200;

  while (numbers.length < max) {
    const page = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
      pageSize,
      pageOffset,
    });

    for (const contact of page.data) {
      const phones = contact.phoneNumbers ?? [];
      for (const entry of phones) {
        const raw = entry.number;
        if (!raw) {
          continue;
        }
        const normalized = normalizeUsCanadaE164(raw);
        if (!normalized || seen.has(normalized)) {
          continue;
        }
        seen.add(normalized);
        numbers.push(normalized);
        if (numbers.length >= max) {
          return numbers;
        }
      }
    }

    if (!page.hasNextPage) {
      break;
    }
    pageOffset += page.data.length;
    if (page.data.length === 0) {
      break;
    }
  }

  return numbers;
}
