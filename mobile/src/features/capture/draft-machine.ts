/**
 * Capture draft state machine — pure transitions for tests and UI.
 * Local drafts stay outside TanStack Query; only URIs and keys are stored.
 */

export type CaptureUiPhase =
  | 'checking_permission'
  | 'needs_permission'
  | 'permission_blocked'
  | 'camera'
  | 'review'
  | 'sending'
  | 'retryable_error'
  | 'terminal_error'
  | 'cooldown'
  | 'success';

export type CaptureSendStep =
  | 'idle'
  | 'preparing'
  | 'creating'
  | 'uploading'
  | 'completing';

export type CaptureDraftSnapshot = {
  rawUri: string | null;
  preparedUri: string | null;
  idempotencyKey: string | null;
  blastId: string | null;
  uploadPath: string | null;
  uploaded: boolean;
};

export type CaptureMachineState = {
  phase: CaptureUiPhase;
  draft: CaptureDraftSnapshot;
  sendStep: CaptureSendStep;
  message: string | null;
  code: string | null;
};

export type CaptureMachineEvent =
  | { type: 'permission_loading' }
  | { type: 'permission_undetermined' }
  | { type: 'permission_denied' }
  | { type: 'permission_blocked' }
  | { type: 'permission_granted' }
  | { type: 'captured'; uri: string }
  | { type: 'retake' }
  | { type: 'confirm_send'; idempotencyKey: string }
  | { type: 'send_step'; step: Exclude<CaptureSendStep, 'idle'> }
  | {
      type: 'send_failed';
      kind: 'retryable' | 'terminal' | 'cooldown';
      message: string;
      code: string;
      draft?: Partial<CaptureDraftSnapshot>;
    }
  | {
      type: 'send_succeeded';
      blastId: string;
      message?: string;
    }
  | { type: 'restore_draft'; draft: CaptureDraftSnapshot }
  | { type: 'clear' };

export const EMPTY_DRAFT: CaptureDraftSnapshot = {
  rawUri: null,
  preparedUri: null,
  idempotencyKey: null,
  blastId: null,
  uploadPath: null,
  uploaded: false,
};

export function initialCaptureMachineState(): CaptureMachineState {
  return {
    phase: 'checking_permission',
    draft: { ...EMPTY_DRAFT },
    sendStep: 'idle',
    message: null,
    code: null,
  };
}

/**
 * Resolve which idempotency key to use on confirm.
 * Retries of the same attempt reuse the draft key; a fresh confirm mints one.
 */
export function resolveIdempotencyKeyForConfirm(
  existingKey: string | null | undefined,
  mint: () => string,
): string {
  if (existingKey && existingKey.length > 0) {
    return existingKey;
  }
  return mint();
}

export function reduceCaptureMachine(
  state: CaptureMachineState,
  event: CaptureMachineEvent,
): CaptureMachineState {
  switch (event.type) {
    case 'permission_loading':
      return { ...state, phase: 'checking_permission', message: null, code: null };
    case 'permission_undetermined':
    case 'permission_denied':
      return { ...state, phase: 'needs_permission', message: null, code: null };
    case 'permission_blocked':
      return {
        ...state,
        phase: 'permission_blocked',
        message:
          'Camera access is turned off. Open Settings to enable it for Capture. Look up still works from home.',
        code: 'CAMERA_BLOCKED',
      };
    case 'permission_granted':
      if (state.draft.rawUri) {
        return { ...state, phase: 'review', message: null, code: null };
      }
      return { ...state, phase: 'camera', message: null, code: null };
    case 'captured':
      return {
        ...state,
        phase: 'review',
        draft: {
          ...EMPTY_DRAFT,
          rawUri: event.uri,
        },
        sendStep: 'idle',
        message: null,
        code: null,
      };
    case 'retake':
      return {
        ...state,
        phase: 'camera',
        draft: { ...EMPTY_DRAFT },
        sendStep: 'idle',
        message: null,
        code: null,
      };
    case 'confirm_send':
      return {
        ...state,
        phase: 'sending',
        draft: {
          ...state.draft,
          idempotencyKey: event.idempotencyKey,
        },
        sendStep: 'preparing',
        message: null,
        code: null,
      };
    case 'send_step':
      return {
        ...state,
        phase: 'sending',
        sendStep: event.step,
      };
    case 'send_failed': {
      const nextDraft = event.draft
        ? { ...state.draft, ...event.draft }
        : state.draft;
      if (event.kind === 'cooldown') {
        return {
          ...state,
          phase: 'cooldown',
          draft: nextDraft,
          sendStep: 'idle',
          message: event.message,
          code: event.code,
        };
      }
      return {
        ...state,
        phase: event.kind === 'terminal' ? 'terminal_error' : 'retryable_error',
        draft: nextDraft,
        sendStep: 'idle',
        message: event.message,
        code: event.code,
      };
    }
    case 'send_succeeded':
      return {
        ...state,
        phase: 'success',
        draft: { ...EMPTY_DRAFT },
        sendStep: 'idle',
        message: event.message ?? 'Sunset sent.',
        code: null,
      };
    case 'restore_draft':
      return {
        ...state,
        phase: event.draft.rawUri ? 'review' : state.phase,
        draft: event.draft,
        sendStep: 'idle',
        message: null,
        code: null,
      };
    case 'clear':
      return {
        ...initialCaptureMachineState(),
        phase: 'camera',
      };
    default:
      return state;
  }
}

export function progressLabel(step: CaptureSendStep): string | null {
  switch (step) {
    case 'preparing':
      return 'Preparing photo…';
    case 'creating':
      return 'Creating blast…';
    case 'uploading':
      return 'Uploading…';
    case 'completing':
      return 'Finishing send…';
    default:
      return null;
  }
}
