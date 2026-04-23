import { z } from 'zod';

export const PickSchema = z.object({
  rank: z.number().int().min(1).max(3),
  item_id: z.string(),
  angle: z.string(),
  rationale: z.string(),
  suggested_visuals: z.array(z.string()),
  risk_flags: z.array(z.string()),
});

export const PicksFileSchema = z.object({
  date: z.string(),
  picks: z.array(PickSchema).length(3),
  rejected: z.array(z.object({ item_id: z.string(), reason: z.string() })),
});
