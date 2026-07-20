export const CAPTURE_ROUTE = '/(app)/capture' as const;

export type HomeCta = 'look_up' | 'capture';

export type HomeCtaIntent =
  | { type: 'confirm_nudge' }
  | { type: 'navigate_capture'; href: typeof CAPTURE_ROUTE }
  | { type: 'blocked_cooldown' };

/**
 * Resolve primary home CTA routing. Look up never opens the camera.
 */
export function resolveHomeCta(cta: HomeCta, cooldownActive: boolean): HomeCtaIntent {
  if (cooldownActive) {
    return { type: 'blocked_cooldown' };
  }

  if (cta === 'look_up') {
    return { type: 'confirm_nudge' };
  }

  return { type: 'navigate_capture', href: CAPTURE_ROUTE };
}

/** True only when the intent would open a camera capture flow. Look up must never. */
export function intentOpensCamera(intent: HomeCtaIntent): boolean {
  return intent.type === 'navigate_capture';
}
