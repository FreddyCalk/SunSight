/** Privacy policy version recorded by `finalize_verified_profile`. */
export const PRIVACY_POLICY_VERSION = '2026-07-17';

/**
 * Optional CAPTCHA site key for environments that enforce Auth CAPTCHA.
 * Local Auth does not require it; staging/production must supply a token.
 */
export const CAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_CAPTCHA_SITE_KEY?.trim() || null;
