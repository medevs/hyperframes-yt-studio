import { z } from 'zod';

// 'news' is reserved for future use (e.g., distinguishing news-article og:images from primary-source og:images).
// The current capture pipeline emits only 'primary', 'og_image', and 'headline_card'.
export const SourceKindSchema = z.enum(['primary', 'news', 'og_image', 'headline_card']);

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
