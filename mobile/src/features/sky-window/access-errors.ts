export type SkyWindowAccessErrorKind = 'auth' | 'retryable' | 'unavailable';

const UNAVAILABLE_CODES = new Set([
  'BLAST_UNAVAILABLE',
  'FORBIDDEN',
  'NOT_FOUND',
]);

const AUTH_CODES = new Set(['AUTH_REQUIRED', 'INVALID_TOKEN']);

export function mapSkyWindowAccessError(error: unknown): SkyWindowAccessErrorKind {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    const code = (error as { code: string }).code;
    if (UNAVAILABLE_CODES.has(code)) {
      return 'unavailable';
    }
    if (AUTH_CODES.has(code)) {
      return 'auth';
    }
  }

  return 'retryable';
}
