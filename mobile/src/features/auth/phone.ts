import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js';

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

/**
 * Progressive national formatting for US/Canada phone input fields.
 * Strips to digits, drops a leading country `1` when length exceeds 10
 * digits, caps at 10 national digits, then formats as-you-type for `US`.
 */
export function formatUsCanadaNationalInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length > 10) {
    digits = digits.slice(1);
  }
  const nationalDigits = digits.slice(0, 10);
  return new AsYouType('US').input(nationalDigits);
}

/**
 * National display form of an E.164 number for OTP hint UI.
 * Returns the original string when parsing fails.
 */
export function formatUsCanadaNationalDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) {
    return e164;
  }
  return parsed.format('NATIONAL');
}
