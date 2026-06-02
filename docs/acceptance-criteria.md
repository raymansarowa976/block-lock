#  block-lock: Master Product Backlog & Acceptance Criteria

##  Phase 1: Workspace Architecture & Local Environment

### Issue #1: Monorepo & Dependency Workspace Setup
*   **Description:** Initialize the overarching project repository structure using `pnpm` workspaces to manage decoupled runtime codebases.
*   **Acceptance Criteria:**
    *   [x] Root `package.json` created defining workspaces for `apps/web`, `services/extension`, and `packages/shared-types`.
    *   [x] `pnpm-workspace.yaml` configured at the root directory.
    *   [x] Global `.gitignore` implemented protecting system files, `node_modules`, `.next/`, and `.env` files.
*   **Status:**
    - [x] Setup Complete

### Issue #2: Turborepo Orchestration & Global Linting
*   **Description:** Configure Turborepo to cache tasks and build pipelines, alongside an immutable global linting matrix.
*   **Acceptance Criteria:**
    *   [x] `turbo.json` created defining build, lint, and test pipelines with strict dependency topology.
    *   [x] Root ESLint and Prettier configurations initialized and inherited by all workspaces.
    *   [x] Commands `pnpm build`, `pnpm lint`, and `pnpm test` executable from root across all workspaces without workspace bleeding.
*   **Status:**
    - [x] Setup Complete

### Issue #3: Multi-Container Docker Infrastructure for Local Development
*   **Description:** Construct a containerized environment to instantly spin up localized isolated data layers.
*   **Acceptance Criteria:**
    *   [x] `docker-compose.yml` configured to spin up a PostgreSQL instance and a Redis instance locally.
    *   [x] Health checks implemented to verify services are fully running before allowing app bindings.
    *   [x] Persistent Docker volumes mapped so database records persist across container restarts.
*   **Status:**
    - [x] Setup Complete

---

##  Phase 2: Web Infrastructure & Data Modeling (apps/web)

### Issue #4: Prisma Schema Design & Relational Topology
*   **Description:** Set up the database data models using Prisma to map rules, schedules, logs, and users.
*   **Acceptance Criteria:**
    *   [x] `schema.prisma` created containing relational models for `User`, `Schedule`, `TimeLimit`, and `UsageLog`.
    *   [x] Cascading deletes (`onDelete: Cascade`) enforced on all relational user models to prevent orphan row memory leaks.
    *   [x] Initial migration successfully applied to the local PostgreSQL instance via `prisma migrate dev`.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

### Issue #5: Auth.js Authentication & Secure Middleware Guarding
*   **Description:** Integrate enterprise-grade OAuth session handling and network-edge route blocking.
*   **Acceptance Criteria:**
    *   [x] Auth.js (NextAuth) handlers initialized under `/app/api/auth/[...nextauth]` with Google or GitHub providers.
    *   [x] Next.js edge-level `middleware.ts` intercepts all requests to `/dashboard*` and `/api/*`.
    *   [x] Unauthenticated requests are rejected with an explicit `401 Unauthorized` status for APIs, or redirect to `/login` for pages.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

### Issue #6: Centralized Validation Layer (packages/shared-types)
*   **Description:** Build the contract validation tier to manage structural mutations between client interfaces and server boundaries.
*   **Acceptance Criteria:**
    *   [x] Workspace initialized to export standalone TypeScript inference models out of **Zod schemas**.
    *   [x] Form configurations (Schedule creation, rule parameters) mapped explicitly to Zod primitives.
    *   [x] Zero instances of the JavaScript fallback runtime `any` keyword present in data schema targets.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

### Issue #7: Database Server Actions & Transactional Mutators
*   **Description:** Implement backend business logic routes handling UI mutations safely.
*   **Acceptance Criteria:**
    *   [x] Next.js Server Actions created to handle creation/deletion of block schedules.
    *   [x] Data arrays pass through Zod validations on the server before mutating database entries.
    *   [x] Write blocks are enveloped within an atomic Prisma `$transaction` pipeline.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

### Issue #8: Next.js Frontend Dashboard Interface
*   **Description:** Assemble the administration web panel using modern accessible UI layers.
*   **Acceptance Criteria:**
    *   [x] Fully styled `/dashboard` page built utilizing `shadcn/ui` design primitives.
    *   [x] Interactive React Hook Forms managing inputs dynamically with embedded loading indicators.
    *   [x] Global nested **React Error Boundaries** configured to catch interface failures gracefully without throwing white screens.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

---

##  Phase 3: High-Performance Cache-First Sync Engine

### Issue #9: Redis Rate-Limiter API Layer
*   **Description:** Build the infrastructure protection barrier inside the sync pipeline to mitigate denial-of-service loops.
*   **Acceptance Criteria:**
    *   [x] Sliding-window rate limiter utilizing Upstash or Redis commands mapped over inbound user tracking calls.
    *   [x] Requests breaking the standard allotment threshold are dropped instantly, throwing a `429 Too Many Requests` response.
    *   [x] Next.js doesn't open database connections when requests are dropped by the rate limiter.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

### Issue #10: Read-Aside Cache Middleware Optimization
*   **Description:** Implement high-speed caching routes to minimize database queries during client synchronization.
*   **Acceptance Criteria:**
    *   [x] Endpoint `/api/sync` checks the Redis cluster for keys patterned under `user:rules:{userId}` first.
    *   [x] **Cache Hit:** Content strings return immediately to the client in sub-milliseconds without firing Prisma calls.
    *   [x] **Cache Miss:** Next.js queries PostgreSQL via Prisma, compiles rules, updates Redis with a strict Time-To-Live (TTL), and returns data.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

### Issue #11: Cache Invalidation Real-Time Invalidation
*   **Description:** Bind data mutations to real-time cache purging actions to prevent stale state bugs.
*   **Acceptance Criteria:**
    *   [x] Any successful Prisma schedule transaction executes an asymmetric call to evict/delete the specific user's Redis entry.
    *   [x] Sub-workspace communication pipelines guarantee eviction runs before confirming mutations to the client web UI.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

---

##  Phase 4: Browser Extension Engine (services/extension)

### Issue #12: Manifest V3 Foundation & Extension Popup UI
*   **Description:** Scaffold the background architecture for modern web standard extension sandboxes.
*   **Acceptance Criteria:**
    *   [x] `manifest.json` configured using version 3 specification parameters with host permissions granted explicitly.
    *   [x] Action icon launches a lightweight Popup view (`popup.tsx`) showing account binding states.
    *   [x] Tailwind UI elements adapt dynamically to variable browser panel sizing constraints.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

### Issue #13: Web-to-Extension Authentication Exchange
*   **Description:** Bridge cookie contexts safely into local extensions to bind browsing rules to authenticated backend users.
*   **Acceptance Criteria:**
    *   [x] Background engine securely captures web authentication credentials via the `chrome.cookies` or `chrome.runtime` messaging pathways.
    * [x] Authenticated user identifiers are persisted in `chrome.storage.local` and cleared immediately when the session expires or the user signs out.
    *   [x] Extension flags connection errors clearly on the UI if tracking contexts become missing or expired.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

### Issue #14: Rule Compiler for Native Browser Engines
*   **Description:** Translate server-side rule schemas into native browser structures.
*   **Acceptance Criteria:**
    *   [x] Background logic parses raw domain strings into specialized regex conditions mapped precisely to `declarativeNetRequest` JSON block actions.
    *   [x] Rules compile automatically and handle multiple distinct edge cases, such as isolating `subdomain.domain.com` without dropping access to base domains.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

### Issue #15: Native Traffic Interception Engine
*   **Description:** Pass rules into the browser engine to block websites with zero lag.
*   **Acceptance Criteria:**
    *   [x] Compiled user rule blocks are written into Chrome's native engine via `chrome.declarativeNetRequest.updateDynamicRules`.
    *   [x] The browser blocks restricted domains instantly on a native thread before pages resolve network packets or generate browser processes.
    *   [x] Memory foot-print of the extension worker matches baseline thread metrics (~0MB idle overhead).
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

---

##  Phase 5: High-Throughput Analytics Pipeline

### Issue #16: Offline Analytics Accumulation Buffer
*   **Description:** Implement low-frequency client trackers to collect browsing intervals locally.
*   **Acceptance Criteria:**
    *   [x] Service worker monitors active browser tab navigation events using the `chrome.tabs` framework.
    *   [x] Local data accumulators increment usage metrics within a local `chrome.storage.local` array.
    *   [x] Individual page actions **never** trigger immediate server network calls, preventing data flood loops.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

### Issue #17: Aggregated Analytics Batch Ingestion
*   **Description:** Build scheduled network flash procedures to stream analytics data cleanly.
*   **Acceptance Criteria:**
    *   [x] background worker sets up a low-latency cron interval to flush accumulators to the server once every 5 minutes.
    *   [x] `/api/analytics` parses the payload against a strict Zod schema to verify data integrity.
    *   [x] Data arrays execute multiple writes to PostgreSQL inside a high-speed Prisma `createMany` batch operation.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

### Issue #18: Analytics Dashboard Charts
*   **Description:** Render raw backend analytical telemetry rows into clear dashboard data charts.
*   **Acceptance Criteria:**
    *   [x] Secure `/dashboard/analytics` view built using the Next.js App router paradigm.
    *   [x] Time logs are parsed using Prisma aggregations to plot minute tracks cleanly across multiple timeline scopes.
    *   [x] Frontend graphs are rendered using `recharts` to map time saved and total browsing duration.
*   **Status:**
    - [x] Code Complete
    - [x] Test/Compliance Checked

---

##  Phase 6: Core Verification & Automation Pipelines

### Issue #19: Vitest Integration Testing Matrix
*   **Description:** Establish isolated test systems ensuring critical code boundaries cannot break.
*   **Acceptance Criteria:**
    *   [ ] Unit tests implemented via **Vitest** covering core schedule overlapping equations.
    *   [ ] Mock infrastructure checks verify `/api/sync` runs purely from Redis during cache hits without engaging Prisma.
    *   [ ] Zod verification flows fail expected schema parameters when feeding garbage arguments.
*   **Status:**
    - [ ] Test/Compliance Checked

### Issue #20: Playwright Extension E2E Test Verification
*   **Description:** Create end-to-end user path verifications validating engine execution flows.
*   **Acceptance Criteria:**
    *   [ ] **Playwright** framework configures headless Chromium profiles to load the built extension asset manually.
    *   [ ] Automated tests navigate onto a designated test web domain and confirm navigation is blocked.
    *   [ ] Logs confirm that checking active elements yields redirected destination contexts matching the active configuration rules.
*   **Status:**
    - [ ] Test/Compliance Checked

### Issue #21: GitHub Actions CI/CD Pipeline Configuration
*   **Description:** Construct automated regression control loops operating over code pushes.
*   **Acceptance Criteria:**
    *   [ ] Workflow script file `.github/workflows/ci.yml` initialized.
    *   [ ] Every incoming Pull Request to the main branch automatically sets up a pnpm store and runs structural TypeScript type-checks.
    *   [ ] Changes block integration merges unless all code patterns pass the lint checks and Vitest coverage suites successfully.
*   **Status:**
    - [ ] Setup Complete

### Issue #22: Multi-Environment Production Deployments
*   **Description:** Map the code artifacts directly onto server hosts to run for actual active users.
*   **Acceptance Criteria:**
    *   [ ] Web Workspace configures seamless production deployment tracking onto Vercel hooked directly to production PostgreSQL targets.
    *   [ ] Upstash Redis cluster keys map automatically matching environmental variable arrays inside production environments.
    *   [ ] Build scripts compile production-grade production extension zip archives under `services/extension/dist/` ready to upload to the Chrome Web Store.
*   **Status:**
    - [ ] Setup Complete
## Phase 7: AI Engineering & Semantic Intelligence Tier

### Issue #23: Vercel AI SDK Integration & Structured Output Pipeline
*   **Description:** Integrate the Vercel AI SDK into the Next.js API layer to handle natural language scheduling requests, translating raw human intents into structured database schemas.
*   **Acceptance Criteria:**
    *   [ ] Next.js endpoint initialized with the `ai` SDK package and connected securely to an upstream model provider (OpenAI/Anthropic).
    *   [ ] System prompt forces strict **Structured JSON Output** utilizing a shared Zod schema matching the relational `Schedule` parameters.
    *   [ ] Natural language strings (e.g., *"Block social media while I work on my CS classes from 9 to 5"*) are successfully parsed into valid, array-backed block records with zero manual input.
*   **Status:**
    - [ ] Code Complete
    - [ ] Test/Compliance Checked

### Issue #24: Semantic Domain Classification Engine via pgvector
*   **Description:** Construct an automated backend pipeline to map unknown web domains into high-dimensional vector spaces, catching evasive distraction sites through semantic similarity instead of hardcoded keyword lists.
*   **Acceptance Criteria:**
    *   [ ] Prisma schema updated to inject the native `pgvector` database extension into the PostgreSQL instance.
    *   [ ] Internal API route intercepts unclassified metadata logs sent by the extension, generating a 1536-dimensional embedding using an industry-standard model (e.g., `text-embedding-3-small`).
    *   [ ] Verification queries utilize cosine similarity mathematical operations (`<->` vector operator) to match site signatures against predefined distraction baselines, auto-blocking matches that cross an 85% confidence score.
*   **Status:**
    - [ ] Code Complete
    - [ ] Test/Compliance Checked

### Issue #25: AI Productivity Coach & Behavioral Telemetry Aggregator
*   **Description:** Build an asynchronous batch analyzer that looks over large historical sets of `UsageLog` data points to compile highly contextual, proactive digital wellness recommendations.
*   **Acceptance Criteria:**
    *   [ ] Crontab routine executes a database aggregation that summarizes user metrics across a trailing 7-day window.
    *   [ ] Data arrays are injected cleanly into a contextual prompt window, mapping specific focus drop patterns (e.g., micro-relapses into social media).
    *   [ ] System processes insights cleanly via dynamic markdown interfaces inside the `/dashboard/intelligence` view panel.
*   **Status:**
    - [ ] Code Complete
    - [ ] Test/Compliance Checked

### Issue #26: AI Engine Validation & Error Mitigation Matrix
*   **Description:** Construct dedicated unit test suites to protect the application backend against LLM hallucinations, structural drifts, or corrupted payload formatting.
*   **Acceptance Criteria:**
    *   [ ] Isolated test suites created using **Vitest** that securely mock model API responses.
    *   [ ] Validation checkpoints catch and reject malformed JSON objects before they reach Prisma to guarantee database entity integrity.
    *   [ ] System handles nonsensical or empty conversational strings gracefully, returning standardized payload signatures (`{ success: false, error: "..." }`) rather than running broken database operations.
*   **Status:**
    - [ ] Test/Compliance Checked
