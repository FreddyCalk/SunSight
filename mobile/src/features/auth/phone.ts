import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** Matches backend Edge / database +1 NANP contract. */
export const E164_PLUS_ONE_PATTERN = /^\+1[2-9]\d{9}$/;

/**
 * Normalize a user-entered phone number to US/Canada +1 E.164.
 * Returns null when the number is missing, invalid, or outside +1.
 */
export function normalizeUsCanadaE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = parsePhoneNumberFromString(trimmed, 'US');
  if (!parsed || !parsed.isValid()) {
    return null;
  }

  if (parsed.countryCallingCode !== '1') {
    return null;
  }

  if (parsed.country !== 'US' && parsed.country !== 'CA') {
    return null;
  }

  const e164 = parsed.format('E.164');
  if (!E164_PLUS_ONE_PATTERN.test(e164)) {
    return null;
  }

  return e164;
}

export function isUsCanadaE164(value: string): boolean {
  return E164_PLUS_ONE_PATTERN.test(value);
}
