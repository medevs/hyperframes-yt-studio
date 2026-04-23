import { z } from 'zod';

export const ClaimSchema = z.object({
  id: z.number().int().min(1),
  section: z.string(),
  claim_text: z.string(),
  supporting_quote: z.string(),
  source_item_id: z.string(),
  source_url: z.string().url(),
});

export const ClaimsFileSchema = z.object({
  claims: z.array(ClaimSchema),
});
