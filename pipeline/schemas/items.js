import { z } from 'zod';

export const ItemSchema = z.object({
  id: z.string(),
  source: z.enum(['hackernews', 'rss', 'company_blog']),
  source_url: z.string().url(),
  external_url: z.string().url(),
  title: z.string(),
  summary: z.string(),
  published_at: z.string(),
  signals: z.record(z.number()).optional(),
  article_text_path: z.string().optional(),
  text_extraction_failed: z.boolean().optional(),
});

export const ItemsFileSchema = z.object({
  fetched_at: z.string(),
  items: z.array(ItemSchema),
});
