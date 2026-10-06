import { revokeSyncTokensFor } from "@/lib/sync-token"

// Loosely typed to avoid pulling in next-auth's JWT/Adapter types here —
// the JWT-strategy branch is the only one this app uses (see auth.ts), and
// all we need off it is `sub`.
type SignOutMessage = { token?: { sub?: string } | null } | { session?: unknown }

// Ends the extension's sync token the moment a dashboard session signs out,
// rather than leaving a leaked/replayed token valid until its own 15-minute
// expiry. Wired into NextAuth's `events.signOut` (see auth.ts) so it fires
// for every sign-out path, including the built-in /api/auth/signout route.
export async function handleSignOut(message: SignOutMessage): Promise<void> {
  if ("token" in message && message.token?.sub) {
    await revokeSyncTokensFor(message.token.sub)
  }
}
