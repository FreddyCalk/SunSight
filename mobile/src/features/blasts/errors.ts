export type BlastErrorKind = 'cooldown' | 'retryable' | 'terminal';

export type ClassifiedBlastError = {
  kind: BlastErrorKind;
  code: string;
  message: string;
};

const COOLDOWN_CODES = new Set(['BLAST_RATE_LIMITED']);

const TERMINAL_CODES = new Set([
  'INVALID_REQUEST',
  'INVALID_JSON',
  'INVALID_RESPONSE',
  'FORBIDDEN',
  'AUTH_REQUIRED',
  'INVALID_TOKEN',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'METHOD_NOT_ALLOWED',
  'INVALID_IMAGE',
  'PHOTO_NOT_FOUND',
  'PHOTO_NOT_COMPLETABLE',
  // Server fails closed until an EXIF-safe processor exists; retry will not succeed.
  'MEDIA_PROCESSOR_UNAVAILABLE',
]);

type CodedError = {
  name?: string;
  code: string;
  message: string;
};

function asCodedError(error: unknown): CodedError | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const name =
      'name' in error && typeof (error as { name: unknown }).name === 'string'
        ? (error as { name: string }).name
        : undefined;
    return {
      name,
      code: (error as { code: string }).code,
      message: (error as { message: string }).message,
    };
  }
  return null;
}

/**
 * Classify Edge / network failures for Look up and Capture send UX.
 * Cooldown is shared across both CTAs; do not treat it as retryable.
 */
export function classifyBlastError(error: unknown): ClassifiedBlastError {
  const coded = asCodedError(error);
  if (coded) {
    if (COOLDOWN_CODES.has(coded.code)) {
      return {
        kind: 'cooldown',
        code: coded.code,
        message: coded.message || 'Please wait before sending another sunset alert.',
      };
    }

    if (TERMINAL_CODES.has(coded.code)) {
      return {
        kind: 'terminal',
        code: coded.code,
        message: coded.message || 'This sunset alert could not be sent.',
      };
    }

    if (coded.name === 'EdgeInvokeError') {
      return {
        kind: 'retryable',
        code: coded.code,
        message: coded.message || 'Something went wrong. Try again.',
      };
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return {
      kind: 'retryable',
      code: 'CLIENT_ERROR',
      message: error.message,
    };
  }

  return {
    kind: 'retryable',
    code: 'UNKNOWN',
    message: 'Something went wrong. Try again.',
  };
}
