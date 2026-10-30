import { describe, it, expect, vi, beforeEach, Mock } from "vitest";

// Unlike sync.test.ts, lib/sync-token is NOT mocked here: every request goes
// through the real HMAC/expiry/revocation checks. This pins the seam between
// the route and the token lib — e.g. a route that switched to the I/O-free
// decodeVerifiedPayload would silently stop honouring sign-out revocation,
// and the mocked suite couldn't notice.
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { timeLimit: { findMany: vi.fn() } },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));

import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  mintSyncToken,
  revokeSyncTokensFor,
  SYNC_TOKEN_TTL_MS,
} from "@/lib/sync-token";
import { GET } from "@/app/api/sync/route";

const mockGet = redis.get as unknown as Mock;
const mockSet = redis.set as unknown as Mock;
const mockFindMany = (prisma as unknown as { timeLimit: { findMany: Mock } })
  .timeLimit.findMany;
const mockRateLimit = rateLimit as unknown as Mock;

const USER_ID = "clh3q5g0o0000qmij2z3m4n5k";
const OTHER_USER_ID = "clh3q5g0o0009qmij2z3m4n5k";
const SECRET = "test-secret-do-not-use-in-prod";
const REVOCATION_KEY = `sync-token:revoked-before:${USER_ID}`;

// Fake Redis keyed store, so revocation cutoffs and the rules cache coexist
// the way they do in Upstash.
let store: Map<string, unknown>;

function syncRequest(token: string) {
  return new Request("http://localhost/api/sync", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function expectNoDataAccess() {
  expect(mockRateLimit).not.toHaveBeenCalled();
  expect(mockFindMany).not.toHaveBeenCalled();
  expect(mockGet).not.toHaveBeenCalledWith(`user:rules:${USER_ID}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SECRET = SECRET;
  store = new Map();
  mockGet.mockImplementation(async (key: string) => store.get(key) ?? null);
  mockSet.mockImplementation(async (key: string, value: unknown) => {
    store.set(key, value);
    return "OK";
  });
  mockFindMany.mockResolvedValue([]);
  mockRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 59,
    resetAt: Date.now() + 60_000,
  });
});

describe("GET /api/sync – real token verification", () => {
  it("accepts a freshly minted token and scopes the query to its user", async () => {
    const { token } = mintSyncToken(USER_ID);
    const res = await GET(syncRequest(token));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } })
    );
  });

  it("rejects an expired token with 401 and touches no user data", async () => {
    const { token } = mintSyncToken(
      USER_ID,
      Date.now() - SYNC_TOKEN_TTL_MS - 1
    );
    const res = await GET(syncRequest(token));
    expect(res.status).toBe(401);
    expectNoDataAccess();
  });

  it("rejects a token whose payload was swapped to another user (signature mismatch)", async () => {
    const { token } = mintSyncToken(USER_ID);
    const [, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        sub: OTHER_USER_ID,
        iat: Date.now(),
        exp: Date.now() + SYNC_TOKEN_TTL_MS,
      })
    ).toString("base64url");

    const res = await GET(syncRequest(`${forgedPayload}.${signature}`));
    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("rejects a token signed with a different secret", async () => {
    process.env.AUTH_SECRET = "some-other-deployment-secret";
    const { token } = mintSyncToken(USER_ID);
    process.env.AUTH_SECRET = SECRET;

    const res = await GET(syncRequest(token));
    expect(res.status).toBe(401);
    expectNoDataAccess();
  });

  it("rejects a token issued before a sign-out revocation", async () => {
    const issuedAt = Date.now() - 1_000;
    const { token } = mintSyncToken(USER_ID, issuedAt);
    await revokeSyncTokensFor(USER_ID, issuedAt + 1);

    const res = await GET(syncRequest(token));
    expect(res.status).toBe(401);
    expect(mockGet).toHaveBeenCalledWith(REVOCATION_KEY);
    expectNoDataAccess();
  });

  it("still accepts a token minted after the revocation cutoff (re-login)", async () => {
    const cutoff = Date.now() - 1_000;
    await revokeSyncTokensFor(USER_ID, cutoff);
    const { token } = mintSyncToken(USER_ID, cutoff + 1);

    const res = await GET(syncRequest(token));
    expect(res.status).toBe(200);
  });

  it("does not let one user's revocation block another user's token", async () => {
    await revokeSyncTokensFor(OTHER_USER_ID, Date.now());
    const { token } = mintSyncToken(USER_ID, Date.now() - 1_000);

    const res = await GET(syncRequest(token));
    expect(res.status).toBe(200);
  });

  it.each([
    ["a bare userId", USER_ID],
    ["a token with no signature segment", "eyJzdWIiOiJ4In0"],
    ["a token with too many segments", "a.b.c"],
    ["an empty signature", "eyJzdWIiOiJ4In0."],
    ["a non-JSON payload with a well-formed shape", "bm90LWpzb24.c2ln"],
  ])("rejects %s with 401", async (_label, token) => {
    const res = await GET(syncRequest(token));
    expect(res.status).toBe(401);
    expectNoDataAccess();
  });

  it("rejects a correctly signed payload that is missing required claims", async () => {
    // Sign a payload with no `exp` using the real secret, via the same
    // construction the lib uses — proves claim validation, not just HMAC.
    const { createHmac } = await import("crypto");
    const payload = Buffer.from(
      JSON.stringify({ sub: USER_ID, iat: Date.now() })
    ).toString("base64url");
    const sig = createHmac("sha256", SECRET)
      .update(payload)
      .digest("base64url");

    const res = await GET(syncRequest(`${payload}.${sig}`));
    expect(res.status).toBe(401);
    expectNoDataAccess();
  });
});
