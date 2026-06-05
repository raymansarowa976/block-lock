import { z } from "zod"

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const HHMMTime = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Expected HH:MM format")

const DayOfWeek = z.number().int().min(0).max(6)

const Domain = z
  .string()
  .min(1)
  .regex(
    /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
    "Invalid domain format",
  )

// ---------------------------------------------------------------------------
// DB model schemas — mirror the Prisma models exactly
// ---------------------------------------------------------------------------

export const TimeLimitSchema = z.object({
  id: z.string().cuid(),
  userId: z.string().cuid(),
  domain: Domain,
  dailyLimit: z.number().int().positive().nullable(),
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const ScheduleSchema = z.object({
  id: z.string().cuid(),
  timeLimitId: z.string().cuid(),
  startTime: HHMMTime,
  endTime: HHMMTime,
  daysOfWeek: z.array(DayOfWeek).min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const UsageLogSchema = z.object({
  id: z.string().cuid(),
  userId: z.string().cuid(),
  timeLimitId: z.string().cuid().nullable(),
  domain: Domain,
  duration: z.number().int().nonnegative(),
  blockedAt: z.coerce.date().nullable(),
  loggedAt: z.coerce.date(),
})

// ---------------------------------------------------------------------------
// Form / input schemas — strip server-generated fields for client forms
// ---------------------------------------------------------------------------

export const CreateTimeLimitSchema = z.object({
  domain: Domain,
  // null means the domain is unconditionally blocked; positive integer = minutes/day
  dailyLimit: z.number().int().positive().nullable(),
  isActive: z.boolean().default(true),
})

export const UpdateTimeLimitSchema = CreateTimeLimitSchema.partial()

export const CreateScheduleSchema = z.object({
  timeLimitId: z.string().cuid(),
  startTime: HHMMTime,
  endTime: HHMMTime,
  daysOfWeek: z.array(DayOfWeek).min(1, "At least one day required"),
})

export const UpdateScheduleSchema = CreateScheduleSchema
  .omit({ timeLimitId: true })
  .partial()

// ---------------------------------------------------------------------------
// API payload schemas
// ---------------------------------------------------------------------------

// `rules` kept for chrome extension backward compatibility (payload.rules)
export const SyncPayloadSchema = z.object({
  userId: z.string().cuid(),
  rules: z.array(TimeLimitSchema),
  schedules: z.array(ScheduleSchema),
  syncedAt: z.coerce.date(),
})

export const UsageEventSchema = z.object({
  timeLimitId: z.string().cuid().nullable(),
  domain: Domain,
  duration: z.number().int().nonnegative(),
  blockedAt: z.coerce.date().nullable(),
})

export const AnalyticsEntrySchema = z.object({
  domain: Domain,
  startedAt: z.number().int().nonnegative(),
  duration: z.number().int().nonnegative(),
})

export const AnalyticsBatchSchema = z.object({
  entries: z.array(AnalyticsEntrySchema).min(1),
})

// ---------------------------------------------------------------------------
// TypeScript types
// ---------------------------------------------------------------------------

export type TimeLimit = z.infer<typeof TimeLimitSchema>
export type Schedule = z.infer<typeof ScheduleSchema>
export type UsageLog = z.infer<typeof UsageLogSchema>
export type CreateTimeLimit = z.infer<typeof CreateTimeLimitSchema>
export type UpdateTimeLimit = z.infer<typeof UpdateTimeLimitSchema>
export type CreateSchedule = z.infer<typeof CreateScheduleSchema>
export type UpdateSchedule = z.infer<typeof UpdateScheduleSchema>
export type SyncPayload = z.infer<typeof SyncPayloadSchema>
export type UsageEvent = z.infer<typeof UsageEventSchema>
export type AnalyticsEntry = z.infer<typeof AnalyticsEntrySchema>
export type AnalyticsBatch = z.infer<typeof AnalyticsBatchSchema>