import * as SecureStore from 'expo-secure-store';

const CONSENT_KEY_PREFIX = 'sunsight.contacts.match_consent.';

function consentKey(userId: string): string {
  return `${CONSENT_KEY_PREFIX}${userId}`;
}

export type StoredContactsConsent = {
  consentedAt: string;
};

/**
 * Read whether this user already accepted contact matching disclosure.
 * Stores only the consent timestamp — never contact numbers.
 */
export async function getContactsMatchingConsent(
  userId: string,
): Promise<StoredContactsConsent | null> {
  if (!(await SecureStore.isAvailableAsync())) {
    return null;
  }

  const raw = await SecureStore.getItemAsync(consentKey(userId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredContactsConsent;
    if (typeof parsed.consentedAt !== 'string' || !parsed.consentedAt) {
      return null;
    }
    return { consentedAt: parsed.consentedAt };
  } catch {
    return null;
  }
}

export async function saveContactsMatchingConsent(
  userId: string,
  consentedAt: string = new Date().toISOString(),
): Promise<StoredContactsConsent> {
  const value: StoredContactsConsent = { consentedAt };
  if (await SecureStore.isAvailableAsync()) {
    await SecureStore.setItemAsync(consentKey(userId), JSON.stringify(value));
  }
  return value;
}

export const CONTACTS_MATCHING_DISCLOSURE =
  'With your permission, Sunsight sends supported phone numbers from your contacts to Sunsight over an encrypted connection to find registered people you may notify. Sunsight briefly processes those numbers, protects matching with a server-secret HMAC rather than plain SHA-256, discards the raw numbers, and stores only temporary matches to Sunsight user IDs.';
