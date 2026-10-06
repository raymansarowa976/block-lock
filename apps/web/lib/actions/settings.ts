"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"

export async function getUserSettings() {
  const session = await auth()
  if (!session?.user?.id) return { success: false as const, error: "Unauthorized" }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  })

  if (!user) return { success: false as const, error: "User not found" }

  return {
    success: true as const,
    data: {
      email: user.email,
      name: user.name,
      image: user.image,
      hardLockMode: user.hardLockMode,
      createdAt: user.createdAt,
    },
  }
}

export async function updateHardLockMode(enabled: boolean) {
  const session = await auth()
  if (!session?.user?.id) return { success: false as const, error: "Unauthorized" }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { hardLockMode: enabled },
  })

  return { success: true as const }
}

export async function deleteUserAccount(confirmationEmail: string) {
  const session = await auth()
  if (!session?.user?.id) return { success: false as const, error: "Unauthorized" }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  })

  if (!user) return { success: false as const, error: "User not found" }

  if (user.email.toLowerCase() !== confirmationEmail.toLowerCase()) {
    return { success: false as const, error: "Email does not match" }
  }

  await prisma.user.delete({ where: { id: session.user.id } })

  // Cache invalidation is best-effort: /api/sync's cache entries carry a
  // 5-minute TTL, so a failed eviction just means a briefly stale entry —
  // that's far better than letting a Redis outage fail an account deletion
  // that already committed.
  try {
    await redis.del(`user:rules:${session.user.id}`)
  } catch (err) {
    console.error("Failed to invalidate rules cache", err)
  }

  return { success: true as const }
}
