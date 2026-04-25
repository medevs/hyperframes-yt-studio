import { z } from 'zod';

export const SourceKindSchema = z.enum(['primary', 'og_image', 'headline_card']);

export const ScreenshotsManifestSchema = z.object({
  entries: z.array(z.object({
    item_id: z.string(),
    path: z.string().nullable(),
    fallback: z.boolean(),
    source_domain: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    source_kind: SourceKindSchema,
    error: z.string().optional(),
  })),
});
