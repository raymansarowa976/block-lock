## Pre-Deployment Checklist — Vercel

### 1. Provision a Production PostgreSQL Database
- [x] Create a PostgreSQL database (Neon, Supabase, or Railway recommended for Vercel)
- [x] Copy the connection string — this is your `DATABASE_URL`
- [x] Run migrations against the production DB: `pnpm prisma migrate deploy`

### 2. Provision Upstash Redis
- [x] Create a Redis database at [upstash.com](https://upstash.com) (or via Vercel Marketplace → Storage)
- [x] Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

### 3. Set Up Google OAuth
- [ ] Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
- [ ] Create an OAuth 2.0 Client ID (Web application)
- [ ] Add your Vercel production URL to **Authorised JavaScript origins** (e.g. `https://block-lock.vercel.app`)
- [ ] Add `https://block-lock.vercel.app/api/auth/callback/google` to **Authorised redirect URIs**
- [ ] Copy `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### 4. Generate Auth Secret
- [ ] Run `npx auth secret` (or `openssl rand -base64 32`) to generate `AUTH_SECRET`

### 5. Connect Repo to Vercel
- [x] Import the repository in the Vercel dashboard
- [x] Set **Root Directory** to `apps/web`
- [x] Set **Framework Preset** to Next.js
- [x] Set **Build Command** to `prisma generate && next build`

### 6. Add Environment Variables in Vercel (Production)
- [ ] `DATABASE_URL` — PostgreSQL connection string
- [ ] `UPSTASH_REDIS_REST_URL`
- [ ] `UPSTASH_REDIS_REST_TOKEN`
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `AUTH_SECRET`
- [ ] `AUTH_URL` — your production URL (e.g. `https://block-lock.vercel.app`)

### 7. Verify First Deploy
- [ ] Trigger a deploy and confirm the build passes
- [ ] Visit `/login` and confirm Google sign-in works end to end
- [ ] Confirm no `PrismaClientInitializationError` in Vercel function logs

---

## Chrome Web Store Publication Checklist

### 8. Prepare the Extension
- [ ] Design and export a 128×128 PNG icon (also 16×16 and 48×48 recommended)
- [ ] Add `icons` field to `manifest.json` pointing to the icon files
- [ ] Remove `http://localhost:3000/*` from `externally_connectable` in `manifest.json`
- [ ] Rebuild and re-zip: `pnpm --filter @block-lock/extension build`

### 9. Legal & Store Requirements
- [ ] Write and host a privacy policy (required — extension uses `storage` and `<all_urls>` host permissions)
- [ ] Register as a Chrome Web Store developer at [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole) ($5 one-time fee)

### 10. Submit to the Chrome Web Store
- [ ] Create a new item and upload `dist/block-lock-extension-0.1.0.zip`
- [ ] Fill in the store listing: name, description, category, screenshots (at least one 1280×800 or 640×400)
- [ ] Add your privacy policy URL
- [ ] Submit for review (typically 1–3 business days)
