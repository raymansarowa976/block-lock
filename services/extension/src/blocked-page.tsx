import React, { useEffect, useState } from "react"

type Rule = {
  domain: string
  dailyLimit: number | null
  isActive: boolean
}

type LoadState = "loading" | Rule | null

function getDomain(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get("domain") ?? ""
}

export function BlockedPage(): React.ReactElement {
  const domain = getDomain()
  const [rule, setRule] = useState<LoadState>("loading")

  useEffect(() => {
    chrome.storage.local.get(["rules"]).then((result) => {
      const rules: Rule[] = result.rules ?? []
      setRule(rules.find((r) => r.domain === domain) ?? null)
    })
  }, [domain])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-8 text-center">
      <h1 className="mb-8 text-6xl font-bold tracking-widest text-red-600">BLOCKED</h1>

      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        fill="none"
        className="mb-6 size-16"
        aria-label="Block Lock logo"
        role="img"
      >
        <rect width="32" height="32" rx="8" fill="#dc2626" />
        <path d="M16 5L7 9v7c0 5 3.9 9.7 9 11 5.1-1.3 9-6 9-11V9l-9-4z" fill="white" />
        <path d="M13 16l2 2 4-4" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {domain && <p className="mb-4 text-xl text-slate-700">{domain}</p>}

      <div data-testid="block-duration" className="text-sm text-slate-500">
        {rule === "loading"
          ? "Loading…"
          : rule === null
            ? "Blocked"
            : rule.dailyLimit === null
              ? "Always blocked"
              : `Daily limit: ${rule.dailyLimit} min`}
      </div>
    </div>
  )
}