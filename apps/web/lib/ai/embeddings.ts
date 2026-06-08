import { embed } from "ai"
import { openai } from "@ai-sdk/openai"

const EMBEDDING_MODEL = "text-embedding-3-small"

export async function generateDomainEmbedding(domain: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: domain,
  })
  return embedding
}
