# Four New Modules + Production-Ready Infra

## Architecture decisions (read first)

**Storage: local + S3-compatible cloud (not Google Drive).** Drive is the wrong tool for app file storage — quotas live on a personal Google account, no CDN/public URLs, OAuth-heavy server API. The industry-standard abstraction is a `StorageDriver` interface with a **`local` driver** (default, zero-config dev, files outside `public/` served through an authenticated API route) and an **`s3` driver** (refactor of the kit's existing AWS-SDK client — works with DO Spaces, AWS S3, MinIO, Cloudflare R2, Backblaze). Google Drive can be added later as a *user-facing* feature ("export to your Drive"), which is what it's actually good at. If you insist on Drive-as-backend I'll add it as a third driver — say so at approval.

**Redis: optional, key-gated.** New `lib/cache.ts` with a Redis driver (ioredis) when `REDIS_URL` is set, in-memory fallback when not — dev stays zero-config, prod gets shared cache. First consumers: **rate limiting** on login/signup/reset (10 req / 5 min per IP) and caching plan lookups.

**Billing: Stripe, key-gated like email.** No `STRIPE_SECRET_KEY` → module reports `{enabled:false}` and the UI shows a clean "not configured" state. Code-complete + typecheck/build verified; live checkout needs your Stripe keys + a price created in the dashboard.

**Go / microservices — my honest advice: not yet.** Don't split anything now. A stateless Next.js app + PostgreSQL + Redis + S3/CDN serves millions of users fine; premature microservices would multiply operational pain with zero user benefit. What I'm building instead are the *seams*: every module is a service behind an interface with pluggable drivers (storage, cache, notify channels) — when a piece outgrows the monolith (likely first candidates: a **Go media-processing worker** for image resizing/av Armstrong, a **Go realtime/WebSocket gateway**, or a **Go webhook-receiver**), that interface becomes the service boundary. Sticking to PostgreSQL as agreed.

---

## Phase 1 — Schema + deps
- New models: **`Attachment`** (companyId?, uploaderId, filename, mimeType, size, storageDriver, storageKey, visibility PRIVATE/PUBLIC), **`CompanySetting`** (1:1 with Company: timezone, currency, locale, dateFormat, timeFormat, emailFooter, meta Json), **`Notification`** (companyId?, userId, type, title, body, link?, data Json?, readAt? + indexes), **`Plan`** (slug, name, priceMonthly cents, currency, stripePriceId?, maxUsers?, isActive, isDefault), **`Subscription`** (1:1 with Company: planId, status, stripeCustomerId?, stripeSubscriptionId?, currentPeriodEnd?, cancelAtPeriodEnd).
- Seed: Free plan (maxUsers 5, default) + Pro plan (no user limit); Acme/Globex get active Free subscriptions.
- `npm i stripe ioredis`.

## Phase 2 — Infra libs
- `lib/cache.ts` — get/set/del/incr + `cached(key, ttl, fn)`; Redis|memory driver via `REDIS_URL`.
- `lib/rate-limit.ts` — fixed-window limiter on the cache; wired into login (`authorize`), signup, and reset-password (401/429-style JSON error, per-IP).

## Phase 3 — Files module
- `services/storage.ts` — `StorageDriver` interface + `local` + `s3` drivers, selected by `STORAGE_DRIVER` env (default `local`); uploads dir configurable, size limit `UPLOAD_MAX_SIZE_MB` (default 10).
- APIs: `POST /api/files` (multipart, session + tenant, mime/size validation), `GET /api/files/[id]` (PUBLIC files: open; PRIVATE: session + same-company only; local streams from disk, s3 302s to URL), `DELETE /api/files/[id]` (uploader or superadmin).
- UI: reusable `FileDropzone` component + `useFileUpload` hook; **avatar upload wired into the user profile** as the live integration.

## Phase 4 — Company settings
- `lib/company-settings.ts` — `getCompanySettings()` get-or-create with defaults.
- `GET/PUT /api/user-management/settings` — company admin: own company; superadmin: `?companyId=`.
- Console page at `/user-management/settings` (admins): timezone/currency/locale/date+time format/email footer; superadmin gets a company selector. Menu entry added.

## Phase 5 — Notifications
- `services/notifications.ts` — `notify({ recipients|companyRole, type, title, body, link, channels })`; `in-app` writes rows, `email` channel reuses `send-email`.
- APIs: list (own, paged), unread-count, mark-read, mark-all-read.
- UI: **bell icon in the topbar** (unread badge, 30s polling, recent list, mark-all) + full notifications page; live event wired: inviting a user notifies their company admins.

## Phase 6 — Billing
- `lib/billing.ts` — `isBillingEnabled()`, `getCompanySubscription()` (cached 60s), `enforceUserSeatLimit()` wired into the invite route (403 with clear message when the Free plan's seats are full).
- APIs: `GET /api/billing/plans`, `GET /api/billing/subscription`, `POST /api/billing/checkout` (Stripe Checkout session), `POST /api/billing/portal`, `POST /api/billing/webhook` (signature-verified; handles checkout/subscription updated/deleted).
- UI: `/user-management/billing` — current plan + seat usage bar, plan cards with Upgrade (when enabled), "billing not configured" state otherwise.

## Phase 7 — Verify + docs
- `db:push` + `db:seed`; typecheck + `next build`.
- Live curl verification: upload→download→delete a file (local driver), settings GET/PUT as admin + 403 scoping, invite → notification appears + seat limit fires on 6th invite, rate-limit kicks in on the 11th rapid login, billing disabled-state.
- Update `.env.example`, README API matrix, `codebase.md` (modules section + Go/microservices growth path).

**Not in scope (deliberately):** SMS/WhatsApp channel, webhooks-out, CSV import/export — documented as next candidates.