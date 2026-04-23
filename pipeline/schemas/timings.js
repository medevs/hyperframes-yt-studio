import { z } from 'zod';

export const TimingsFileSchema = z.object({
  audio_file: z.string(),
  total_duration_sec: z.number().positive(),
  scenes: z.array(z.object({
    id: z.string(),
    kind: z.enum(['intro', 'story', 'outro']),
    story_num: z.number().int().min(1).max(3).optional(),
    start_sec: z.number().nonnegative(),
    duration_sec: z.number().positive(),
    word_count: z.number().int().nonnegative(),
  })).length(5),
  words: z.array(z.object({
    text: z.string(),
    start_sec: z.number().nonnegative(),
    end_sec: z.number().positive(),
  })).nonempty(),
});
