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

  await redis.del(`user:rules:${userId}`)
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

  const timeLimit = await prisma.$transaction(async (tx) => {
    const existing = await tx.timeLimit.findUnique({ where: { id } })
    if (!existing || existing.userId !== userId) throw new Error("Not found")
    return tx.timeLimit.update({ where: { id }, data: parsed.data })
  })

  await redis.del(`user:rules:${userId}`)
  revalidatePath("/dashboard")
  return { success: true as const, data: timeLimit }
}

export async function deleteTimeLimit(id: string) {
  const userId = await requireUserId().catch(() => null)
  if (!userId) return { success: false as const, error: "Unauthorized" }

  const hardLockError = await checkHardLock(userId, id)
  if (hardLockError) return hardLockError

  await prisma.$transaction(async (tx) => {
    const existing = await tx.timeLimit.findUnique({ where: { id } })
    if (!existing || existing.userId !== userId) throw new Error("Not found")
    await tx.timeLimit.delete({ where: { id } })
  })

  await redis.del(`user:rules:${userId}`)
  revalidatePath("/dashboard")
  return { success: true as const }
}