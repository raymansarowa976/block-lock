import { describe, it, expect } from "vitest"
import {
  CreateTimeLimitSchema,
  UpdateTimeLimitSchema,
  CreateScheduleSchema,
  UpdateScheduleSchema,
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