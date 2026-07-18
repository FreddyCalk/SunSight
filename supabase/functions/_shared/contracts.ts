import { z } from "zod";

export const matchContactsSchema = z.object({
  consented: z.literal(true),
  consentedAt: z.iso.datetime(),
  contacts: z.array(z.string().regex(/^\+1[2-9][0-9]{9}$/)).max(1000),
}).strict();

export const workerRequestSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
}).strict();
