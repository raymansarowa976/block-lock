"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { DEFAULT_DAILY_LIMIT_MINUTES } from "@/lib/constants"
import {
  CreateScheduleSchema,
  UpdateScheduleSchema,
  CreateScheduleForDomainSchema,
} from "@block-lock/shared-types"

async function requireUserId(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

// Cache invalidation is best-effort: /api/sync's cache entries carry a
// 5-minute TTL, so a failed eviction just means briefly stale rules — that's
// far better than letting a Redis outage (e.g. DNS failure reaching Upstash)
// fail a database write that already succeeded.
async function invalidateRulesCache(userId: string): Promise<void> {
  try {
    await redis.del(`user:rules:${userId}`)
  } catch (err) {
    console.error("Failed to invalidate rules cache", err)
  }
}

// A website that is unconditionally blocked (TimeLimit.dailyLimit === null)
// cannot also have a schedule attached to it.
async function checkNotBlocked(timeLimitId: string) {
  const timeLimit = await prisma.timeLimit.findUnique({ where: { id: timeLimitId } })
  if (timeLimit && timeLimit.dailyLimit === null) {
    return {
      success: false as const,
      error: "Cannot add a schedule to a website that is already blocked",
    }
  }
  return null
}

export async function createSchedule(raw: unknown) {
  const userId = await requireUserId().catch(() => null)
  if (!userId) return { success: false as const, error: "Unauthorized" }

  const parsed = CreateScheduleSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors }
  }

  const blockedError = await checkNotBlocked(parsed.data.timeLimitId)
  if (blockedError) return blockedError

  const schedule = await prisma.$transaction(async (tx) => {
    // Verify the parent TimeLimit belongs to this user before attaching a schedule
    const timeLimit = await tx.timeLimit.findUnique({
      where: { id: parsed.data.timeLimitId },
    })
    if (!timeLimit || timeLimit.userId !== userId) throw new Error("Not found")
    return tx.schedule.create({ data: parsed.data })
  })

  await invalidateRulesCache(userId)
  revalidatePath("/dashboard")
  return { success: true as const, data: schedule }
}

// Schedules a website by domain, resolving the parent TimeLimit if one
// already exists, or auto-creating one (with a default daily limit, never
// an unconditional block) if the domain has no rule yet.
export async function createScheduleForDomain(raw: unknown) {
  const userId = await requireUserId().catch(() => null)
  if (!userId) return { success: false as const, error: "Unauthorized" }

  const parsed = CreateScheduleForDomainSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors }
  }

  const { domain, startTime, endTime, daysOfWeek } = parsed.data

  const outcome = await prisma.$transaction(async (tx) => {
    let timeLimit = await tx.timeLimit.findUnique({
      where: { userId_domain: { userId, domain } },
    })

    if (timeLimit && timeLimit.dailyLimit === null) {
      return { blocked: true as const }
    }

    if (!timeLimit) {
      timeLimit = await tx.timeLimit.create({
        data: { userId, domain, dailyLimit: DEFAULT_DAILY_LIMIT_MINUTES, isActive: true },
      })
    }

    const schedule = await tx.schedule.create({
      data: { timeLimitId: timeLimit.id, startTime, endTime, daysOfWeek },
    })
    return { blocked: false as const, timeLimit, schedule }
  })

  if (outcome.blocked) {
    return {
      success: false as const,
      error: "Cannot add a schedule to a website that is already blocked",
    }
  }

  await invalidateRulesCache(userId)
  revalidatePath("/dashboard")
  return {
    success: true as const,
    data: { timeLimit: outcome.timeLimit, schedule: outcome.schedule },
  }
}

export async function updateSchedule(id: string, raw: unknown) {
  const userId = await requireUserId().catch(() => null)
  if (!userId) return { success: false as const, error: "Unauthorized" }

  const parsed = UpdateScheduleSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors }
  }

  const schedule = await prisma.$transaction(async (tx) => {
    const existing = await tx.schedule.findUnique({
      where: { id },
      include: { timeLimit: true },
    })
    if (!existing || existing.timeLimit.userId !== userId) throw new Error("Not found")
    return tx.schedule.update({ where: { id }, data: parsed.data })
  })

  await invalidateRulesCache(userId)
  revalidatePath("/dashboard")
  return { success: true as const, data: schedule }
}

export async function deleteSchedule(id: string) {
  const userId = await requireUserId().catch(() => null)
  if (!userId) return { success: false as const, error: "Unauthorized" }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.schedule.findUnique({
      where: { id },
      include: { timeLimit: true },
    })
    if (!existing || existing.timeLimit.userId !== userId) throw new Error("Not found")
    await tx.schedule.delete({ where: { id } })
  })

  await invalidateRulesCache(userId)
  revalidatePath("/dashboard")
  return { success: true as const }
}