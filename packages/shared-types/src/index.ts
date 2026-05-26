import { z } from "zod";

export const BlockRuleSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  domain: z.string().min(1),
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const BlockScheduleSchema = z.object({
  id: z.string().uuid(),
  ruleId: z.string().uuid(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
});

export const SyncPayloadSchema = z.object({
  userId: z.string().uuid(),
  rules: z.array(BlockRuleSchema),
  schedules: z.array(BlockScheduleSchema),
  syncedAt: z.coerce.date(),
});

export const AnalyticsEventSchema = z.object({
  userId: z.string().uuid(),
  domain: z.string(),
  blockedAt: z.coerce.date(),
  ruleId: z.string().uuid(),
});

export type BlockRule = z.infer<typeof BlockRuleSchema>;
export type BlockSchedule = z.infer<typeof BlockScheduleSchema>;
export type SyncPayload = z.infer<typeof SyncPayloadSchema>;
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;