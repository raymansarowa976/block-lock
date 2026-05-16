##  Technical Stack & Engineering Justifications (Updated)

`block-lock` utilizes a modern, distributed architecture designed to ensure cross-runtime stability, optimal data synchronization, absolute type safety, and infrastructure resilience under high-concurrency traffic loops.

---

###  Workspace Architecture & Management

#### Turborepo (with pnpm Workspaces)
* **What it does:** Orchestrates the multi-project monorepo layout holding both the Next.js web application (`apps/web`) and the Chrome extension (`services/extension`).
* **Justification:** Turborepo provides content-aware hashing and remote build caching. If the extension code hasn't changed, Turborepo skips its build process entirely during continuous integration (CI) pipelines, accelerating deployment times on Vercel. Pairing it with `pnpm` ensures symbolic linking of local modules without duplicating `node_modules` mass.

---

###  The Web Infrastructure (`apps/web`)

#### Next.js (App Router) & TypeScript
* **What it does:** Serves as the user-facing administration panel, onboarding pipeline, and API endpoint hub.
* **Justification:** Next.js Server Components (RSC) drastically reduce the bundle size sent to the user by rendering configuration tables and analytical dashboards server-side. TypeScript is enforced globally to guarantee structural predictability across complex data maps.

#### Prisma ORM & PostgreSQL
* **What it does:** Controls persistent storage and relational schemas via an automated object-relational mapping pipeline connected to a relational Postgres database.
* **Justification:** `block-lock` handles deeply relational user data (e.g., users owning multi-day block schedules containing dynamic domain configurations). Prisma handles transactional database writes smoothly via its `$transaction` API, ensuring data structures never fall into asynchronous race conditions.

#### Auth.js (NextAuth)
* **What it does:** Governs user authentication sessions across the web domain and validates token payloads coming from the browser extension.
* **Justification:** Hand-rolling security features introduces major vulnerability vectors. Auth.js abstracts secure OAuth 2.0 flows, allowing users to safely log into `block-lock` using industry-grade session handling.

---

###  The Performance & Scalability Tier

#### Redis (Upstash / ioredis)
* **What it does:** Acts as a high-speed, in-memory caching layer and rate-limiter positioned directly in front of the Next.js API endpoints.
* **Justification:** Browser extensions can create aggressive read/write traffic patterns (e.g., polling rules on browser startup, streaming analytics). Redis handles sub-millisecond data lookups entirely in memory, which protects our system in two critical areas:
  1. **Rule Caching:** Active blocklists are stored as JSON keys (`user:rules:{id}`) with a Time-To-Live (TTL). When the extension requests rules, it hits the Redis cache instead of hammering PostgreSQL. The cache is invalidated immediately when a user mutates their settings on the web dashboard.
  2. **API Rate Limiting:** Enforces a sliding-window token bucket to prevent abuse or infinite sync-loop bugs from exhausting backend resources.

---

###  The Core Enforcement Engine (`services/extension`)

#### Chrome Extension Manifest V3 (`declarativeNetRequest` API)
* **What it does:** Runs inside the browser's background service worker to block network traffic to restricted target domains.
* **Justification:** Manifest V3 is the mandatory production standard. Older ad-blocker style systems intercepted every network request using the slow, privacy-invasive `webRequest` API. `block-lock` passes JSON-based regex blocking rules directly into Chrome’s native `declarativeNetRequest` engine. The browser intercepts blocked pages instantly at the native platform layer, keeping client-side memory overhead close to 0MB.

---

###  Shared Cross-Runtime Layer (`packages/shared-types`)

#### Zod
* **What it does:** Manages structured schema verification across distinct network runtimes.
* **Justification:** Because the Chrome Extension runs in a client's local browser while Next.js runs on a cloud server, they need a unified mechanism to trust payload communication. By sharing centralized Zod validation models, data structures passed via API routes (e.g., sync payloads, aggregated analytics logs) are parsed and guaranteed type-safe on both sides before hitting the application layers.

---
