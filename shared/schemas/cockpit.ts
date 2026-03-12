import { z } from 'zod';
import { voiceSessionStatusSchema } from './voice';

export const cockpitPanelIdSchema = z.enum(['needs-attention', 'waiting-on-ryan', 'recently-shipped']);
export type CockpitPanelId = z.infer<typeof cockpitPanelIdSchema>;

export const cockpitPanelItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  href: z.string().min(1),
  badge: z.string().optional(),
  status: voiceSessionStatusSchema,
  source: z.enum(['voice']),
});
export type CockpitPanelItem = z.infer<typeof cockpitPanelItemSchema>;

export const cockpitPanelSchema = z.object({
  id: cockpitPanelIdSchema,
  title: z.string().min(1),
  emptyMessage: z.string().min(1),
  items: z.array(cockpitPanelItemSchema),
});
export type CockpitPanel = z.infer<typeof cockpitPanelSchema>;

export const cockpitHomeResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  voiceSummary: z.object({
    totalSessions: z.number().int().nonnegative(),
    activeSessions: z.number().int().nonnegative(),
    failedSessions: z.number().int().nonnegative(),
  }),
  panels: z.tuple([cockpitPanelSchema, cockpitPanelSchema, cockpitPanelSchema]),
});
export type CockpitHomeResponse = z.infer<typeof cockpitHomeResponseSchema>;
