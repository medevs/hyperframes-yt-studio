import { z } from 'zod';

export const SceneSchema = z.object({
  id: z.string(),
  kind: z.enum(['intro', 'story', 'outro']),
  story_num: z.number().int().min(1).max(3).optional(),
  item_id: z.string().optional(),
  target_duration_sec: z.number().positive(),
  beats: z.array(z.object({
    at_sec: z.number().nonnegative(),
    kind: z.enum(['headline', 'screenshot', 'number_callout', 'label', 'takeaway', 'source_chip']),
    content: z.string(),
    note: z.string().optional(),
  })).min(1),
  transition_in: z.enum(['cinematic_zoom', 'sdf_iris', 'crossfade', 'hard_cut']),
});

export const StoryboardFileSchema = z.object({
  scenes: z.array(SceneSchema).length(5),
});
