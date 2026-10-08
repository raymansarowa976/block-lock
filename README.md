# Block Lock

A high-performance, open-source productivity tool combining a **Next.js web dashboard** and a **Manifest V3 Chrome extension** to dynamically block and limit distracting websites based on custom schedules and daily time budgets.

> **Status: Active development.** Core blocking, scheduling, and analytics are working. Deployment to Vercel is planned — the project is not yet live.

---

## What it does

- Define per-domain blocking rules with optional daily time limits (e.g. "allow Reddit for 20 min/day")
- Attach time-of-day schedules to rules (e.g. "enforce only on weekdays 9–17")
- Chrome extension enforces rules at the network level via `declarativeNetRequest` — no page injection, no slowdown (top-level page loads only; see [Blocking scope](#blocking-scope))
- Analytics pipeline streams browsing durations from the extension to the dashboard, charted by day/week/month
- Dashboard shows total browsing time and time saved by blocking across all tracked domains

---

## Blocking scope

Block Lock blocks **top-level page loads** of a blocked domain: typing it in the address bar, following a link to it, or opening it in a new tab. The tab is redirected to Block Lock's blocked page.

It deliberately does **not** block a blocked domain when an allowed page loads it as a sub-resource:

| Loaded from an allowed page as… | Blocked? |
|---|---|
| Top-level navigation (address bar, link, new tab) | Yes |
| Embedded `<iframe>` (e.g. a YouTube embed in a blog post) | No |
| `fetch` / `XMLHttpRequest`, scripts, images, fonts | No |

This is a stated limitation, not an oversight:

- **Blocking a domain everywhere breaks unrelated sites.** Many distracting domains also serve shared infrastructure. Blocking `google.com` or `youtube.com` everywhere would break Google sign-in, reCAPTCHA, fonts and video embeds on sites you never meant to block.
- **Time limits are measured the same way.** Daily time limits only count time spent in a tab whose top-level page is that domain. Blocking embeds would block something the time limit never counted.
- **The blocked page only makes sense for a whole tab.** There's nothing useful to redirect a background request to.

Block Lock adds friction against habitual visits; it isn't a tamper-proof content filter. To change the scope, edit `resourceTypes` in [`services/extension/src/rule-engine.ts`](services/extension/src/rule-engine.ts). Sub-resources would need a separate rule with the `block` action. Redirecting an iframe to the blocked page would also require listing `blocked.html` under `web_accessible_resources`.

---

## Tech stack

| Layer | Technology |
|---|---|
| Web app | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Auth | Auth.js v5 (Google OAuth, JWT sessions) |
| Database | PostgreSQL via Prisma 6 |
| Cache | Redis (Upstash or local) |
| Extension | Manifest V3, Vite, React 19 |
| Charts | Recharts |
| Testing | Vitest, Testing Library |
| Monorepo | pnpm workspaces + Turborepo |

---

## Local setup

### Prerequisites

- **Node.js** 20+
- **pnpm** 9+ — `npm install -g pnpm`
- **PostgreSQL** running locally (or a connection string to a hosted instance such as Neon or Supabase)
- **Redis** running locally (or an Upstash URL)
- A **Google OAuth app** — create one at [console.cloud.google.com](https://console.cloud.google.com), add `http://localhost:3000/api/auth/callback/google` as an authorised redirect URI

### 1. Clone and install

```bash
git clone https://github.com/raymansarowa976/block-lock.git
cd block-lock
pnpm install
```

### 2. Configure environment variables

```bash
cp apps/web/.env.example apps/web/.env
```

Open `apps/web/.env` and fill in each value:

```env
# PostgreSQL connection string
DATABASE_URL="postgresql://postgres:password@localhost:5432/block_lock?schema=public"

# Redis (local or Upstash)
REDIS_URL="redis://localhost:6379"

# Auth.js — generate a secret with: openssl rand -base64 32
AUTH_URL="http://localhost:3000"
AUTH_SECRET="your-generated-secret"

# Google OAuth credentials
AUTH_GOOGLE_ID="your-google-client-id"
AUTH_GOOGLE_SECRET="your-google-client-secret"
```

### 3. Set up the database

```bash
cd apps/web
pnpm dlx prisma migrate dev --name init
```

This creates all tables and generates the Prisma client.

### 4. Run the web app

```bash
# From the repo root
pnpm --filter web dev
```

The dashboard is now at [http://localhost:3000](http://localhost:3000).

### 5. Build and load the Chrome extension

```bash
pnpm --filter extension build
```

This produces a `services/extension/dist/` folder. Load it into Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select `services/extension/dist/`
4. Note the extension ID shown on the card — you'll need it if you add `NEXT_PUBLIC_EXTENSION_ID` to the env file

Sign in to the dashboard and the extension will automatically sync your blocking rules.

To ship an extension update to the Chrome Web Store, follow [services/extension/RELEASING.md](services/extension/RELEASING.md).

### 6. Run the tests

```bash
# All packages
pnpm test

# Web app only
pnpm --filter web test

# Extension only
pnpm --filter extension test
```

---

## Project structure

```
block-lock/
├── apps/
│   └── web/                  # Next.js dashboard (pages, API routes, server actions)
├── services/
│   └── extension/            # Chrome extension (background SW, popup, rule engine)
├── packages/
│   └── shared-types/         # Zod schemas and TypeScript types shared by both
└── prisma/                   # Database schema lives under apps/web/prisma/
```

---

## Deploying your own instance

The project is designed to deploy on **Vercel** (web app) with a hosted PostgreSQL database (Neon recommended) and Redis (Upstash recommended).

> Deployment guide coming once the project reaches a stable release.