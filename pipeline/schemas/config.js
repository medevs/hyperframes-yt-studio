import { z } from 'zod';

export const ConfigSchema = z.object({
  sources: z.object({
    rss: z.array(z.string().url()),
    hackernews: z.object({
      min_points: z.number().int().positive(),
      keywords: z.array(z.string()).nonempty(),
    }),
    company_blogs: z.array(z.string().url()),
    js_rendered_domains: z.array(z.string()),
  }),
  tts: z.object({
    voice: z.string(),
    speed: z.number().positive(),
  }),
  video: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    target_duration_sec: z.number().positive(),
    render_quality: z.enum(['draft', 'standard', 'high']),
  }),
  channel: z.object({
    name: z.string(),
    style_name: z.string(),
    accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  }),
});
