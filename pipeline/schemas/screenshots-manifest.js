import { z } from 'zod';

export const ScreenshotsManifestSchema = z.object({
  entries: z.array(z.object({
    item_id: z.string(),
    path: z.string().nullable(),
    fallback: z.boolean(),
    source_domain: z.string(),
    error: z.string().optional(),
  })),
});
