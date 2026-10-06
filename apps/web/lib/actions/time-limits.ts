"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import {
  CreateTimeLimitSchema,
  UpdateTimeLimitSchema,
} from "@block-lock/shared-types"
import { Prisma } from "@prisma/client"

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

function isScheduleCurrentlyActive(
  schedules: Array<{ startTime: string; endTime: string; daysOfWeek: number[] }>,
): boolean {
  const now = new Date()
  const currentDay = now.getDay()
  const hours = String(now.getHours()).padStart(2, "0")
  const minutes = String(now.getMinutes()).padStart(2, "0")
  const currentTime = `${hours}:${minutes}`
  return schedules.some(
    (s) =>
      s.daysOfWeek.includes(currentDay) &&
      s.startTime <= currentTime &&
      currentTime < s.endTime,
  )
}

// A website cannot be blocked (dailyLimit: null) while it still has a
// schedule attached — unschedule it first, or vice versa.
async function checkBlockScheduleConflict(
  timeLimitId: string,
  data: { dailyLimit?: number | null },
) {
  if (data.dailyLimit !== null) return null

  const timeLimit = await prisma.timeLimit.findUnique({
    where: { id: timeLimitId },
    include: { schedules: true },
  })
  if (timeLimit && timeLimit.schedules.length > 0) {
    return {
      success: false as const,
      error: "Cannot block a website that has an active schedule",
    }
  }
  return null
}

async function checkHardLock(userId: string, timeLimitId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.hardLockMode) return null
  const timeLimit = await prisma.timeLimit.findUnique({
    where: { id: timeLimitId },
    include: { schedules: true },
  })
  if (timeLimit?.isActive && isScheduleCurrentlyActive(timeLimit.schedules)) {
    return {
      success: false as const,
      error:
        "Cannot modify rules while Hard Lock Mode is active and a schedule is currently enforced",
    }
  }
  return null
}

export async function createTimeLimit(raw: unknown) {
  const userId = await requireUserId().catch(() => null)
  if (!userId) return { success: false as const, error: "Unauthorized" }

  const parsed = CreateTimeLimitSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors }
  }

  let timeLimit
  try {
    timeLimit = await prisma.$transaction((tx) =>
      tx.timeLimit.create({
        data: { userId, ...parsed.data },
      }),
    )
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { success: false as const, error: "This domain is already in your list." }
    }
    throw err
  }

  await invalidateRulesCache(userId)
  revalidatePath("/dashboard")
  return { success: true as const, data: timeLimit }
}

export async function updateTimeLimit(id: string, raw: unknown) {
  const userId = await requireUserId().catch(() => null)
  if (!userId) return { success: false as const, error: "Unauthorized" }

  const parsed = UpdateTimeLimitSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors }
  }

  const hardLockError = await checkHardLock(userId, id)
  if (hardLockError) return hardLockError

  const blockScheduleError = await checkBlockScheduleConflict(id, parsed.data)
  if (blockScheduleError) return blockScheduleError

  const timeLimit = await prisma.$transaction(async (tx) => {
    const existing = await tx.timeLimit.findUnique({ where: { id } })
    if (!existing || existing.userId !== userId) throw new Error("Not found")
    return tx.timeLimit.update({ where: { id }, data: parsed.data })
  })

  await invalidateRulesCache(userId)
  revalidatePath("/dashboard")
  return { success: true as const, data: timeLimit }
}

export async function deleteTimeLimit(id: string) {
  const userId = await requireUserId().catch(() => null)
  if (!userId) return { success: false as const, error: "Unauthorized" }

  const hardLockError = await checkHardLock(userId, id)
  if (hardLockError) return hardLockError

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.timeLimit.findUnique({ where: { id } })
      if (!existing) return
      if (existing.userId !== userId) throw new Error("Not found")
      await tx.timeLimit.delete({ where: { id } })
    })
  } catch (err) {
    // A duplicate in-flight delete request for the same rule (e.g. a
    // double-click) can delete the row between our existence check and the
    // delete call. Treat that race as a no-op success instead of surfacing
    // an error for a rule that is, correctly, already gone.
    const isAlreadyDeleted =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025"
    if (!isAlreadyDeleted) throw err
  }

  await invalidateRulesCache(userId)
  revalidatePath("/dashboard")
  return { success: true as const }
}