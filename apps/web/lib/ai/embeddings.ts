import { embed } from "ai"
import { openai } from "@ai-sdk/openai"

const EMBEDDING_MODEL = "text-embedding-3-small"
const EXPECTED_DIMENSIONS = 1536

export async function generateDomainEmbedding(domain: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: domain,
  })

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(`Embedding model returned an empty or non-array vector for "${domain}"`)
  }
  if (embedding.length !== EXPECTED_DIMENSIONS) {
    throw new Error(
      `Expected ${EXPECTED_DIMENSIONS}-dimensional embedding but received ${embedding.length} dimensions for "${domain}"`,
    )
  }
  if (!embedding.every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new Error(`Embedding contains non-numeric or non-finite values for "${domain}"`)
  }

  return embedding
}
