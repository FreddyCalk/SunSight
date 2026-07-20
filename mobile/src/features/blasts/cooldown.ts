import type { BlastCooldownState } from './keys';

export const SHARED_COOLDOWN_MESSAGE =
  'Please wait before sending another sunset alert.';

export function createCooldownState(
  nowMs: number,
  durationMs: number,
  message = SHARED_COOLDOWN_MESSAGE,
): BlastCooldownState {
  return {
    untilMs: nowMs + durationMs,
    message,
  };
}

export function activeCooldownMessage(
  state: BlastCooldownState | null | undefined,
  nowMs: number,
): string | null {
  return state && state.untilMs > nowMs ? state.message : null;
}
