// Each kind of dynamic declarativeNetRequest rule owns a disjoint id range, so a
// rebuild of one kind only removes its own rules and never collides with another
// (e.g. a future temporary "unblock" override). Add new kinds as new ranges.
export type RuleIdNamespace = { min: number; max: number }

export const RULE_ID_NAMESPACES = {
  // Starts at 1 so ids from the legacy `index + 1` scheme are still cleaned up.
  block: { min: 1, max: 999_999 },
} as const satisfies Record<string, RuleIdNamespace>

export function isInNamespace(id: number, ns: RuleIdNamespace): boolean {
  return id >= ns.min && id <= ns.max
}

// 32-bit FNV-1a
function hash(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// Derives an id per key from its hash, so a key keeps the same id across rebuilds.
// On a collision, probes forward (wrapping within the namespace) to the next free id.
export function assignRuleIds(keys: string[], ns: RuleIdNamespace): number[] {
  const size = ns.max - ns.min + 1
  if (keys.length > size) {
    throw new Error(`Cannot assign ${keys.length} rule ids in a namespace of size ${size}`)
  }

  const taken = new Set<number>()
  return keys.map((key) => {
    let offset = hash(key) % size
    while (taken.has(ns.min + offset)) offset = (offset + 1) % size
    const id = ns.min + offset
    taken.add(id)
    return id
  })
}
