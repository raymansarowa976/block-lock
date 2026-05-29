"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import {
  CreateScheduleSchema,
  UpdateScheduleSchema,
} from "@block-lock/shared-types"

async function requireUserId(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

export async function createSchedule(raw: unknown) {
  const userId = await requireUserId().catch(() => null)
  if (!userId) return { success: false as const, error: "Unauthorized" }

  const parsed = CreateScheduleSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors }
  }

  const schedule = await prisma.$transaction(async (tx) => {
    // Verify the parent TimeLimit belongs to this user before attaching a schedule
    const timeLimit = await tx.timeLimit.findUnique({
      where: { id: parsed.data.timeLimitId },
    })
    if (!timeLimit || timeLimit.userId !== userId) throw new Error("Not found")
    return tx.schedule.create({ data: parsed.data })
  })

  revalidatePath("/dashboard")
  return { success: true as const, data: schedule }
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

  revalidatePath("/dashboard")
  return { success: true as const }
}