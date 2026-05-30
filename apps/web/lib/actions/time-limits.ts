"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import {
  CreateTimeLimitSchema,
  UpdateTimeLimitSchema,
} from "@block-lock/shared-types"

async function requireUserId(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

export async function createTimeLimit(raw: unknown) {
  const userId = await requireUserId().catch(() => null)
  if (!userId) return { success: false as const, error: "Unauthorized" }

  const parsed = CreateTimeLimitSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors }
  }

  const timeLimit = await prisma.$transaction((tx) =>
    tx.timeLimit.create({
      data: { userId, ...parsed.data },
    }),
  )

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

  await prisma.$transaction(async (tx) => {
    const existing = await tx.timeLimit.findUnique({ where: { id } })
    if (!existing || existing.userId !== userId) throw new Error("Not found")
    await tx.timeLimit.delete({ where: { id } })
  })

  await redis.del(`user:rules:${userId}`)
  revalidatePath("/dashboard")
  return { success: true as const }
}