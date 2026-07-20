import { classifyBlastError } from '@/features/blasts/errors';
import {
  createNudgeBlast,
  mintBlastIdempotencyKey,
  type CreateNudgeBlastResult,
} from '@/features/blasts/create-blast';
import {
  ensureBlastPrerequisites,
  type BlastPrepPrompts,
} from '@/features/blasts/prep-send';
import type { SunsightClient } from '@/lib/supabase';

export type NudgeSendPhase =
  | 'idle'
  | 'confirm'
  | 'contacts'
  | 'location'
  | 'sending'
  | 'success'
  | 'cooldown'
  | 'retryable_error'
  | 'terminal_error';

export type NudgeSendResult =
  | { ok: true; blast: CreateNudgeBlastResult }
  | {
      ok: false;
      phase: Extract<
        NudgeSendPhase,
        'cooldown' | 'retryable_error' | 'terminal_error' | 'contacts' | 'location'
      >;
      message: string;
      code?: string;
      idempotencyKey?: string;
    };

export type NudgeSendPrompts = BlastPrepPrompts & {
  confirmSend: () => Promise<boolean>;
};

/**
 * Look up send path: confirm → contacts consent/match → location → create-blast nudge.
 * Never opens the camera. Reuses `idempotencyKey` on retry of the same attempt.
 */
export async function sendNudgeBlast(
  client: SunsightClient,
  userId: string,
  prompts: NudgeSendPrompts,
  options?: { idempotencyKey?: string },
): Promise<NudgeSendResult> {
  const confirmed = await prompts.confirmSend();
  if (!confirmed) {
    return {
      ok: false,
      phase: 'terminal_error',
      message: 'Send cancelled.',
      code: 'CANCELLED',
    };
  }

  const prep = await ensureBlastPrerequisites(client, userId, prompts);
  if (!prep.ok) {
    return prep;
  }

  const idempotencyKey = options?.idempotencyKey ?? mintBlastIdempotencyKey();

  try {
    const blast = await createNudgeBlast(client, { idempotencyKey });
    return { ok: true, blast };
  } catch (error) {
    const classified = classifyBlastError(error);
    if (classified.kind === 'cooldown') {
      return {
        ok: false,
        phase: 'cooldown',
        message: classified.message,
        code: classified.code,
        idempotencyKey,
      };
    }
    if (classified.kind === 'terminal') {
      return {
        ok: false,
        phase: 'terminal_error',
        message: classified.message,
        code: classified.code,
        idempotencyKey,
      };
    }
    return {
      ok: false,
      phase: 'retryable_error',
      message: classified.message,
      code: classified.code,
      idempotencyKey,
    };
  }
}
