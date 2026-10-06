import ReactMarkdown from "react-markdown"

interface InsightBriefingProps {
  summary: string
  generatedAt: Date
}

const MARKDOWN_COMPONENTS = {
  h1: (props: React.ComponentPropsWithoutRef<"h1">) => (
    <h1 className="mb-3 text-xl font-bold tracking-tight text-slate-900" {...props} />
  ),
  h2: (props: React.ComponentPropsWithoutRef<"h2">) => (
    <h2 className="mt-5 mb-2 text-lg font-semibold tracking-tight text-slate-900" {...props} />
  ),
  h3: (props: React.ComponentPropsWithoutRef<"h3">) => (
    <h3 className="mt-4 mb-1.5 text-base font-semibold text-slate-900" {...props} />
  ),
  p: (props: React.ComponentPropsWithoutRef<"p">) => (
    <p className="mb-3 text-sm leading-relaxed text-slate-700" {...props} />
  ),
  ul: (props: React.ComponentPropsWithoutRef<"ul">) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-slate-700" {...props} />
  ),
  ol: (props: React.ComponentPropsWithoutRef<"ol">) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-slate-700" {...props} />
  ),
  strong: (props: React.ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-slate-900" {...props} />
  ),
}

export function InsightBriefing({ summary, generatedAt }: InsightBriefingProps) {
  return (
    <div>
      <p className="mb-4 text-xs font-medium tracking-wide text-slate-400 uppercase">
        Generated {generatedAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
      </p>
      <ReactMarkdown components={MARKDOWN_COMPONENTS}>{summary}</ReactMarkdown>
    </div>
  )
}
