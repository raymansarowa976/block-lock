import type { Metadata } from "next"
import Link from "next/link"
import { Shield } from "lucide-react"
import { PRIVACY_CONTACT_EMAIL } from "@/lib/constants"

// Public route (proxy.ts only guards /dashboard and /api) — the Chrome Web
// Store listing's privacy policy URL points here. Keep it in step with what
// the extension and API actually collect; __tests__/app/privacy-page.test.tsx
// pins the required disclosures.

const LAST_UPDATED = "October 3, 2026"

export const metadata: Metadata = {
  title: "Privacy Policy · Block Lock",
  description: "What data Block Lock collects, how it is used, and how to delete it.",
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-xl font-semibold text-slate-900">
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function PrivacyPage() {
  const contact = (
    <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="font-medium text-red-600 underline">
      {PRIVACY_CONTACT_EMAIL}
    </a>
  )

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <article className="mx-auto max-w-3xl space-y-10 rounded-3xl border border-slate-200 bg-white px-6 py-10 text-base leading-relaxed text-slate-700 shadow-sm sm:px-12">
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-red-600">
              <Shield className="size-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">Block Lock</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Privacy Policy</h1>
          <p className="text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>
          <p>
            Block Lock is a Chrome extension and web dashboard that helps you stay focused by blocking
            distracting websites and limiting how long you spend on them. This policy explains what
            information Block Lock collects, why, who it is shared with, and how you can delete it.
          </p>
        </header>

        <Section id="collect" title="Information we collect">
          <h3 className="font-semibold text-slate-900">Account information</h3>
          <p>
            You sign in with Google. We receive your name, email address and profile picture from your
            Google account, along with the OAuth tokens Google issues for the sign-in. We use these only
            to identify you and keep you signed in.
          </p>

          <h3 className="font-semibold text-slate-900">Browsing activity (web history)</h3>
          <p>
            While you are signed in, the extension records the domain of each page you load in Chrome
            (for example, <code>youtube.com</code>) and the time spent on that domain before you navigate
            away. This is recorded for every site you visit, not only sites you have blocked, so that the
            dashboard can show where your time goes. These records are stored briefly in the extension and
            uploaded to our servers about every five minutes.
          </p>
          <p>
            We collect the domain name only. We do not collect full URLs, page paths, search queries,
            page titles, page content, form input, keystrokes, or anything typed into websites.
          </p>

          <h3 className="font-semibold text-slate-900">Rules and settings you create</h3>
          <p>
            The sites you choose to block, daily time limits, schedules, and settings such as Hard Lock
            mode. If you use the AI schedule builder, we receive the text you type into it.
          </p>

          <h3 className="font-semibold text-slate-900">Stored only on your device</h3>
          <p>
            The extension keeps a copy of your rules, today&apos;s per-site minutes used, pending usage
            records, and a short-lived sign-in token in Chrome&apos;s local extension storage. Removing the
            extension deletes this data.
          </p>
        </Section>

        <Section id="use" title="How we use information">
          <ul className="list-disc space-y-2 pl-6">
            <li>To enforce your blocking rules, daily limits and schedules across your browsers.</li>
            <li>To show you usage analytics in your dashboard.</li>
            <li>
              To generate a weekly AI productivity briefing that summarizes your time per domain and
              suggests adjustments.
            </li>
            <li>To recognize whether a site you visit looks like a known category of distraction.</li>
            <li>To turn a plain-language request into a blocking schedule when you use the AI builder.</li>
            <li>To protect the service, for example by rate-limiting requests.</li>
          </ul>
          <p>
            We do not use your data for advertising, to build profiles for anyone else, or to determine
            creditworthiness or for lending purposes.
          </p>
        </Section>

        <Section id="share" title="How we share information">
          <p>
            We do not sell your data, and we do not share it with third parties except the service
            providers below, which process it on our behalf to run Block Lock:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Google</strong>: provides sign-in. Google receives the standard information
              involved in an OAuth sign-in.
            </li>
            <li>
              <strong>Vercel</strong>: hosts the web dashboard and API, and runs our scheduled jobs.
            </li>
            <li>
              <strong>Neon</strong>: hosts our Postgres database, which stores your account, rules and
              usage records.
            </li>
            <li>
              <strong>Upstash</strong>: caches your blocking rules and sign-out records for a few minutes
              so the extension can sync quickly.
            </li>
            <li>
              <strong>OpenAI</strong>: receives domain names and weekly per-domain totals (minutes, visit
              counts, block counts) to produce your briefing and classify sites, plus any text you type
              into the AI schedule builder. We do not send your name or email address to OpenAI.
            </li>
          </ul>
          <p>
            We may also disclose information if required by law, or as part of a merger or acquisition,
            in which case this policy will continue to apply to your data.
          </p>
        </Section>

        <Section id="limited-use" title="Chrome Web Store User Data Policy">
          <p>
            The use of information received from Google APIs will adhere to the Chrome Web Store User Data
            Policy, including the Limited Use requirements. Block Lock uses browsing activity only to
            provide and improve its single purpose of helping you manage time spent on websites. We do not
            allow humans to read this data except with your consent, for security purposes, to comply with
            the law, or when it has been aggregated and anonymized.
          </p>
        </Section>

        <Section id="retention" title="Retention and deletion">
          <p>
            We keep your account data, rules and usage history for as long as your account exists.
          </p>
          <p>
            You can permanently delete your account at any time from{" "}
            <strong>Dashboard → Settings → Delete Account</strong>. This immediately removes your profile,
            rules, schedules, usage history and AI briefings from our database. Cached rules expire from
            Upstash within minutes. Uninstalling the extension removes all data stored on your device.
          </p>
          <p>To ask about your data or to request a copy of it, email {contact}.</p>
        </Section>

        <Section id="security" title="Security">
          <p>
            Data is sent over HTTPS. The extension authenticates with short-lived signed tokens that are
            revoked when you sign out, and each account can only access its own data. No method of
            transmission or storage is completely secure, but we work to protect your information.
          </p>
        </Section>

        <Section id="children" title="Children">
          <p>Block Lock is not directed at children under 13, and we do not knowingly collect their data.</p>
        </Section>

        <Section id="changes" title="Changes to this policy">
          <p>
            If we change this policy, we will update the date at the top of this page. If a change
            materially affects how we use data we have already collected, we will ask for your consent
            before applying it.
          </p>
        </Section>

        <Section id="contact" title="Contact">
          <p>Questions about this policy can be sent to {contact}.</p>
        </Section>

        <footer className="border-t border-slate-200 pt-6 text-sm">
          <Link href="/login" className="text-slate-500 hover:text-slate-900">
            ← Back to Block Lock
          </Link>
        </footer>
      </article>
    </div>
  )
}
