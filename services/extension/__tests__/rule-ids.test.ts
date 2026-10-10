import { describe, it, expect } from "vitest"
import { RULE_ID_NAMESPACES, assignRuleIds, isInNamespace } from "../src/rule-ids"

describe("RULE_ID_NAMESPACES", () => {
  it("starts the block namespace at 1 so legacy index-based ids are still owned (and cleaned up) by it", () => {
    expect(RULE_ID_NAMESPACES.block.min).toBe(1)
  })

  it("defines non-overlapping ranges", () => {
    const ranges = Object.values(RULE_ID_NAMESPACES).sort((a, b) => a.min - b.min)
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].min).toBeGreaterThan(ranges[i - 1].max)
    }
  })
})

describe("isInNamespace", () => {
  const ns = { min: 10, max: 20 }

  it("includes both bounds", () => {
    expect(isInNamespace(10, ns)).toBe(true)
    expect(isInNamespace(20, ns)).toBe(true)
  })

  it("excludes ids outside the range", () => {
    expect(isInNamespace(9, ns)).toBe(false)
    expect(isInNamespace(21, ns)).toBe(false)
  })
})

describe("assignRuleIds", () => {
  const ns = RULE_ID_NAMESPACES.block

  it("returns one id per key, all within the namespace", () => {
    const ids = assignRuleIds(["a.com", "b.com", "c.com"], ns)
    expect(ids).toHaveLength(3)
    for (const id of ids) expect(isInNamespace(id, ns)).toBe(true)
  })

  it("returns integer ids", () => {
    for (const id of assignRuleIds(["a.com", "b.com"], ns)) expect(Number.isInteger(id)).toBe(true)
  })

  it("derives the same id for a key on every call", () => {
    expect(assignRuleIds(["example.com"], ns)).toEqual(assignRuleIds(["example.com"], ns))
  })

  it("derives a key's id independently of the other keys and their order", () => {
    const [alone] = assignRuleIds(["example.com"], ns)
    const withOthers = assignRuleIds(["z.com", "example.com", "a.com"], ns)
    expect(withOthers[1]).toBe(alone)
  })

  it("resolves hash collisions so every key still gets a distinct id", () => {
    const tiny = { min: 1, max: 2 }
    const ids = assignRuleIds(["a.com", "b.com"], tiny)
    expect([...ids].sort()).toEqual([1, 2])
  })

  it("throws when there are more keys than ids in the namespace", () => {
    expect(() => assignRuleIds(["a.com", "b.com", "c.com"], { min: 1, max: 2 })).toThrow()
  })
})
