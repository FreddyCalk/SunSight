/** Matches locked MVP `blast_visibility_seconds` default (docs/config-defaults). */
export const BLAST_VISIBILITY_MS = 4 * 60 * 60 * 1000;

function formatLocalYmd(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * UTC instant of the next local midnight in `timeZone` (end of the current local day).
 */
export function nextLocalMidnightUtc(now: Date, timeZone: string): Date {
  const todayYmd = formatLocalYmd(now, timeZone);
  let lo = now.getTime();
  let hi = now.getTime() + 26 * 60 * 60 * 1000;

  while (hi - lo > 250) {
    const mid = Math.floor((lo + hi) / 2);
    if (formatLocalYmd(new Date(mid), timeZone) === todayYmd) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return new Date(hi);
}

/**
 * Product expiry: min(local midnight, now + 4 hours).
 * Callers must send this as `expiresAt` until the Edge Function enforces midnight itself.
 */
export function computeBlastExpiresAt(
  now: Date = new Date(),
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
): { expiresAt: string; timezone: string } {
  const maxVisibility = new Date(now.getTime() + BLAST_VISIBILITY_MS);
  const midnight = nextLocalMidnightUtc(now, timeZone);
  const expiresAt = (midnight.getTime() < maxVisibility.getTime()
    ? midnight
    : maxVisibility
  ).toISOString();

  return { expiresAt, timezone: timeZone };
}
