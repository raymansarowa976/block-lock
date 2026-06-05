import { describe, it, expect } from "vitest"
import {
  CreateTimeLimitSchema,
  UpdateTimeLimitSchema,
  CreateScheduleSchema,
  UpdateScheduleSchema,
  UsageEventSchema,
  AnalyticsBatchSchema,
} from "../index"

const VALID_CUID = "clh3q5g0o0000qmij2z3m4n5k"

describe("CreateTimeLimitSchema", () => {
  it("accepts a valid domain with a daily limit", () => {
    const result = CreateTimeLimitSchema.safeParse({
      domain: "example.com",
      dailyLimit: 30,
    })
    expect(result.success).toBe(true)
  })

  it("accepts null dailyLimit (unconditional block)", () => {
    const result = CreateTimeLimitSchema.safeParse({
      domain: "example.com",
      dailyLimit: null,
    })
    expect(result.success).toBe(true)
  })

  it("defaults isActive to true when omitted", () => {
    const result = CreateTimeLimitSchema.safeParse({
      domain: "example.com",
      dailyLimit: null,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.isActive).toBe(true)
  })

  it("rejects an invalid domain format", () => {
    const result = CreateTimeLimitSchema.safeParse({
      domain: "not a domain!!!",
      dailyLimit: 30,
    })
    expect(result.success).toBe(false)
  })

  it("rejects a bare hostname with no TLD", () => {
    const result = CreateTimeLimitSchema.safeParse({
      domain: "localhost",
      dailyLimit: 30,
    })
    expect(result.success).toBe(false)
  })

  it("rejects a zero dailyLimit (use null to block unconditionally)", () => {
    const result = CreateTimeLimitSchema.safeParse({
      domain: "example.com",
      dailyLimit: 0,
    })
    expect(result.success).toBe(false)
  })

  it("rejects a negative dailyLimit", () => {
    const result = CreateTimeLimitSchema.safeParse({
      domain: "example.com",
      dailyLimit: -10,
    })
    expect(result.success).toBe(false)
  })
})

describe("UpdateTimeLimitSchema", () => {
  it("allows partial updates — only domain", () => {
    const result = UpdateTimeLimitSchema.safeParse({ domain: "new.com" })
    expect(result.success).toBe(true)
  })

  it("allows an empty object (no-op update)", () => {
    const result = UpdateTimeLimitSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("still rejects an invalid domain even in a partial update", () => {
    const result = UpdateTimeLimitSchema.safeParse({ domain: "bad domain" })
    expect(result.success).toBe(false)
  })
})

describe("CreateScheduleSchema", () => {
  it("accepts a valid schedule", () => {
    const result = CreateScheduleSchema.safeParse({
      timeLimitId: VALID_CUID,
      startTime: "09:00",
      endTime: "17:00",
      daysOfWeek: [1, 2, 3, 4, 5],
    })
    expect(result.success).toBe(true)
  })

  it("rejects an invalid time format", () => {
    const result = CreateScheduleSchema.safeParse({
      timeLimitId: VALID_CUID,
      startTime: "9:00",
      endTime: "17:00",
      daysOfWeek: [1],
    })
    expect(result.success).toBe(false)
  })

  it("rejects an out-of-range day", () => {
    const result = CreateScheduleSchema.safeParse({
      timeLimitId: VALID_CUID,
      startTime: "09:00",
      endTime: "17:00",
      daysOfWeek: [7],
    })
    expect(result.success).toBe(false)
  })

  it("rejects an empty daysOfWeek array", () => {
    const result = CreateScheduleSchema.safeParse({
      timeLimitId: VALID_CUID,
      startTime: "09:00",
      endTime: "17:00",
      daysOfWeek: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a missing timeLimitId", () => {
    const result = CreateScheduleSchema.safeParse({
      startTime: "09:00",
      endTime: "17:00",
      daysOfWeek: [1],
    })
    expect(result.success).toBe(false)
  })
})

describe("UpdateScheduleSchema", () => {
  it("allows partial updates — only daysOfWeek", () => {
    const result = UpdateScheduleSchema.safeParse({ daysOfWeek: [0, 6] })
    expect(result.success).toBe(true)
  })

  it("allows an empty object (no-op update)", () => {
    const result = UpdateScheduleSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("still rejects an invalid time format even in a partial update", () => {
    const result = UpdateScheduleSchema.safeParse({ startTime: "9am" })
    expect(result.success).toBe(false)
  })

  it("does not accept timeLimitId (immutable after creation)", () => {
    const result = UpdateScheduleSchema.safeParse({
      timeLimitId: VALID_CUID,
      daysOfWeek: [1],
    })
    // timeLimitId is stripped via .omit() — the parse still succeeds but the
    // field is not present in the output
    if (result.success) {
      expect(result.data).not.toHaveProperty("timeLimitId")
    }
  })
})

// ---------------------------------------------------------------------------
// Domain – deeper garbage cases
// ---------------------------------------------------------------------------

describe("Domain garbage inputs (via CreateTimeLimitSchema)", () => {
  const parse = (domain: unknown) =>
    CreateTimeLimitSchema.safeParse({ domain, dailyLimit: 30 })

  it("rejects an IP address", () => {
    expect(parse("192.168.1.1").success).toBe(false)
  })

  it("rejects a URL with a protocol prefix", () => {
    expect(parse("https://example.com").success).toBe(false)
  })

  it("rejects a domain with a trailing slash", () => {
    expect(parse("example.com/").success).toBe(false)
  })

  it("rejects a domain with a port number", () => {
    expect(parse("example.com:8080").success).toBe(false)
  })

  it("rejects a single-label hostname", () => {
    expect(parse("localhost").success).toBe(false)
  })

  it("rejects special characters in the domain", () => {
    expect(parse("exam!ple.com").success).toBe(false)
  })

  it("accepts a valid subdomain", () => {
    expect(parse("news.ycombinator.com").success).toBe(true)
  })

  it("accepts a hyphenated domain", () => {
    expect(parse("my-site.co.uk").success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// HHMMTime – boundary and garbage cases (via CreateScheduleSchema)
// ---------------------------------------------------------------------------

const SCHEDULE_BASE = { timeLimitId: VALID_CUID, endTime: "17:00", daysOfWeek: [1] }

describe("HHMMTime garbage inputs (via CreateScheduleSchema startTime)", () => {
  const parse = (startTime: unknown) =>
    CreateScheduleSchema.safeParse({ ...SCHEDULE_BASE, startTime })

  it("rejects '9:00' — single-digit hour", () => {
    expect(parse("9:00").success).toBe(false)
  })

  it("rejects '09:0' — single-digit minute", () => {
    expect(parse("09:0").success).toBe(false)
  })

  it("rejects '9am' — non-numeric format", () => {
    expect(parse("9am").success).toBe(false)
  })

  it("rejects an empty string", () => {
    expect(parse("").success).toBe(false)
  })

  it("rejects a bare number", () => {
    expect(parse(900).success).toBe(false)
  })

  it("rejects 'hh:mm' — literal placeholder text", () => {
    expect(parse("hh:mm").success).toBe(false)
  })

  it("accepts '00:00'", () => {
    expect(parse("00:00").success).toBe(true)
  })

  it("accepts '23:59'", () => {
    expect(parse("23:59").success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// DayOfWeek – boundary garbage
// ---------------------------------------------------------------------------

describe("DayOfWeek garbage inputs (via CreateScheduleSchema)", () => {
  const parse = (days: unknown) =>
    CreateScheduleSchema.safeParse({ ...SCHEDULE_BASE, startTime: "09:00", daysOfWeek: days })

  it("rejects day 7 (out of range)", () => {
    expect(parse([7]).success).toBe(false)
  })

  it("rejects a negative day", () => {
    expect(parse([-1]).success).toBe(false)
  })

  it("rejects a float day value", () => {
    expect(parse([1.5]).success).toBe(false)
  })

  it("rejects a string day value", () => {
    expect(parse(["monday"]).success).toBe(false)
  })

  it("accepts the full 0–6 range", () => {
    expect(parse([0, 1, 2, 3, 4, 5, 6]).success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// UsageEventSchema – garbage inputs
// ---------------------------------------------------------------------------

describe("UsageEventSchema garbage inputs", () => {
  const VALID = { timeLimitId: null, domain: "example.com", duration: 120, blockedAt: null }

  it("rejects a negative duration", () => {
    expect(UsageEventSchema.safeParse({ ...VALID, duration: -1 }).success).toBe(false)
  })

  it("rejects a non-integer duration", () => {
    expect(UsageEventSchema.safeParse({ ...VALID, duration: 1.5 }).success).toBe(false)
  })

  it("rejects an invalid domain", () => {
    expect(UsageEventSchema.safeParse({ ...VALID, domain: "not!!valid" }).success).toBe(false)
  })

  it("rejects a missing domain field", () => {
    const { domain: _d, ...rest } = VALID
    expect(UsageEventSchema.safeParse(rest).success).toBe(false)
  })

  it("rejects a missing duration field", () => {
    const { duration: _dur, ...rest } = VALID
    expect(UsageEventSchema.safeParse(rest).success).toBe(false)
  })

  it("accepts a fully valid event with all nullable fields set to null", () => {
    expect(UsageEventSchema.safeParse(VALID).success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AnalyticsBatchSchema – garbage inputs
// ---------------------------------------------------------------------------

describe("AnalyticsBatchSchema garbage inputs", () => {
  it("rejects an empty entries array", () => {
    expect(AnalyticsBatchSchema.safeParse({ entries: [] }).success).toBe(false)
  })

  it("rejects a missing entries key", () => {
    expect(AnalyticsBatchSchema.safeParse({}).success).toBe(false)
  })

  it("rejects an entry with a negative startedAt", () => {
    expect(AnalyticsBatchSchema.safeParse({
      entries: [{ domain: "example.com", startedAt: -1, duration: 60 }],
    }).success).toBe(false)
  })

  it("rejects an entry with a non-integer duration", () => {
    expect(AnalyticsBatchSchema.safeParse({
      entries: [{ domain: "example.com", startedAt: 1000, duration: 1.5 }],
    }).success).toBe(false)
  })

  it("rejects an entry with a non-integer startedAt", () => {
    expect(AnalyticsBatchSchema.safeParse({
      entries: [{ domain: "example.com", startedAt: 1000.5, duration: 60 }],
    }).success).toBe(false)
  })

  it("rejects an entry with an invalid domain", () => {
    expect(AnalyticsBatchSchema.safeParse({
      entries: [{ domain: "bad domain!!!", startedAt: 1000, duration: 60 }],
    }).success).toBe(false)
  })

  it("accepts a valid single-entry batch", () => {
    expect(AnalyticsBatchSchema.safeParse({
      entries: [{ domain: "example.com", startedAt: 1000, duration: 60 }],
    }).success).toBe(true)
  })

  it("accepts a valid multi-entry batch", () => {
    expect(AnalyticsBatchSchema.safeParse({
      entries: [
        { domain: "example.com", startedAt: 1000, duration: 60 },
        { domain: "another.com", startedAt: 2000, duration: 30 },
      ],
    }).success).toBe(true)
  })
})