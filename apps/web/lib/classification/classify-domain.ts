import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"
import { generateDomainEmbedding } from "@/lib/ai/embeddings"
import type { ClassifyDomainResult } from "@block-lock/shared-types"

// Domains scoring at or above this cosine-similarity confidence are auto-blocked.
export const SIMILARITY_THRESHOLD = 0.85

interface NearestBaseline {
  label: string
  distance: number
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`
}

// text-embedding-3-small returns unit-norm vectors, so squared L2 distance and
// cosine distance coincide: d² = 2(1 - cosine_similarity) ⇒ similarity = 1 - d²/2.
// This lets the database rank nearest neighbors with pgvector's `<->` (L2)
// operator while still yielding a cosine-similarity confidence score in JS.
export function similarityFromDistance(distance: number): number {
  return 1 - (distance * distance) / 2
}

async function ensureDomainEmbedding(domain: string): Promise<void> {
  const existing = await prisma.domainEmbedding.findUnique({ where: { domain } })
  if (existing) return

  const embedding = await generateDomainEmbedding(domain)
  const vector = toVectorLiteral(embedding)

  await prisma.$executeRaw`
    INSERT INTO "DomainEmbedding" (id, domain, embedding, "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${domain}, ${vector}::vector, now(), now())
    ON CONFLICT (domain) DO NOTHING
  `
}

async function findNearestBaseline(domain: string): Promise<NearestBaseline | null> {
  const rows = await prisma.$queryRaw<NearestBaseline[]>`
    SELECT b.label AS label, (d.embedding <-> b.embedding)::float8 AS distance
    FROM "DomainEmbedding" d
    CROSS JOIN "DistractionBaseline" b
    WHERE d.domain = ${domain}
    ORDER BY d.embedding <-> b.embedding ASC
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function classifyDomain(userId: string, domain: string): Promise<ClassifyDomainResult> {
  await ensureDomainEmbedding(domain)
  const nearest = await findNearestBaseline(domain)

  if (!nearest) {
    return { domain, matched: false, label: null, similarity: null, blocked: false }
  }

  const similarity = similarityFromDistance(nearest.distance)
  const matched = similarity >= SIMILARITY_THRESHOLD

  if (!matched) {
    return { domain, matched: false, label: nearest.label, similarity, blocked: false }
  }

  // Auto-block: an always-on rule (no daily allowance) for the matched domain.
  await prisma.timeLimit.upsert({
    where: { userId_domain: { userId, domain } },
    update: {},
    create: { userId, domain, dailyLimit: null, isActive: true },
  })

  return { domain, matched: true, label: nearest.label, similarity, blocked: true }
}
