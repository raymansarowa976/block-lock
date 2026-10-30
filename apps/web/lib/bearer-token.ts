// The extension sends its sync token as `Authorization: Bearer <token>`.
// It is never read from the query string: URLs end up in server and proxy
// access logs, which would leak a working credential.
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i)
  return match ? match[1] : null
}
