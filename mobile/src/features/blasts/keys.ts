export const blastKeys = {
  all: ['blasts'] as const,
  byUser: (userId: string) => [...blastKeys.all, 'user', userId] as const,
  detail: (userId: string, blastId: string) =>
    [...blastKeys.byUser(userId), 'detail', blastId] as const,
  /** Client-side shared Look up / Capture cooldown gate (server remains authoritative). */
  cooldown: (userId: string) => [...blastKeys.byUser(userId), 'cooldown'] as const,
};

export type BlastCooldownState = {
  untilMs: number;
  message: string;
};
