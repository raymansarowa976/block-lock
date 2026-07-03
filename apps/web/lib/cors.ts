function allowedExtensionOrigin(): string | null {
  const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID
  return extensionId ? `chrome-extension://${extensionId}` : null
}

export function corsHeaders(origin: string | null): Record<string, string> | null {
  const allowedOrigin = allowedExtensionOrigin()
  if (!origin || !allowedOrigin || origin !== allowedOrigin) return null

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  }
}

export function handleCorsPreflight(request: Request): Response {
  const headers = corsHeaders(request.headers.get("origin"))
  return new Response(null, { status: headers ? 204 : 403, headers: headers ?? undefined })
}
