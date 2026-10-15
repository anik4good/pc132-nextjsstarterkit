# Next.js Backend Starter Kit — Codebase Guide

**Location:** `/Users/anik/project/personal/pc132-nextjsstarterkit`
**What this is:** a self-contained, reusable **multi-tenant (SaaS) backend starter kit** (Next.js + Prisma + PostgreSQL + NextAuth) with a built-in admin console for **companies (tenants), user management, roles, permissions, audit logs, files, notifications, per-company settings, and billing**. Drop it into any project — appointment booking, hospital management, CRM, e-commerce admin — and you have accounts, RBAC, multi-tenancy, and a complete UI component library from day one.

```
pc132-nextjsstarterkit/
├── app/               ← Next.js App Router (API + admin console — all of it)
├── components/        ← 80 UI primitives + AdminShell
├── config/            ← menu / settings / general config
├── lib/               ← auth, api helpers, tenant guards, tokens, email url…
├── prisma/            ← schema (Company, User, UserRole, …) + seed + data
├── providers/ hooks/ i18n/ types/ services/   ← supporting layers
├── proxy.ts           ← auth middleware
├── .env / .env.example
├── README.md          ← quick start + full API reference
└── codebase.md        ← you are here
```

---

## 1. Quick start

```bash
npm install --force        # only needed on a fresh copy (React 19 peer deps)
cp .env.example .env       # then set DATABASE_URL + NEXTAUTH_SECRET
npm run db:push            # create tables in PostgreSQL
npm run db:seed            # roles, permissions, companies, demo users
npm run dev                # → http://localhost:3001
```

Port is pinned to **3001** so it never conflicts with a frontend dev server on 3000.

### Default logins (after seeding)

| Email | Password | Tier |
|---|---|---|
| `owner@kt.com` | `Owner#12345` | **Super Admin** (protected) |
| `demo@kt.com` | `Demo#12345` | Super Admin (demo) |
| `admin@acme.com` | `Admin#12345` | Company Admin — Acme Corp |
| `admin@globex.com` | `Admin#12345` | Company Admin — Globex |
| `member@acme.com` | `Member#12345` | Member — Acme Corp |

The sign-in page renders these as click-to-autofill demo buttons.

### Current database

`.env` points at the LAN PostgreSQL: `postgresql://nextjsstarterkit:nextjsstarterkit@192.168.100.31:5432/nextjsstarterkit` (pushed + seeded). For a new product, create a new database and update `DATABASE_URL`.

---

## 2. Multi-tenant (SaaS) model

- **`Company`** is the tenant table. `User.companyId` is nullable — `null` only for platform superadmins.
- **Three access tiers**, enforced in `lib/api-helpers.ts`:
  1. **Super Admin** — role flagged `isSuperAdmin: true`. No company. Bypasses all tenant filters; manages companies, roles, permissions, every user.
  2. **Company Admin** — role flagged `isCompanyAdmin: true` (seeded: `Administrator`). Manages only users of its own company; can edit its own company profile; cannot touch superadmins or assign the superadmin role.
  3. **Member** — normal user. Only "My Activity"; management APIs return 403.
- **Role catalog is global** — companies don't define their own roles; users are bound to a company via `companyId`. For an appointment product you'd add `doctor`/`patient` roles and decide which are `isCompanyAdmin`.
- **Sessions** carry `id, name, email, avatar, roleId, roleName, roleSlug, isSuperAdmin, isCompanyAdmin, companyId, companyName, status`.
- **Audit logs** (`SystemLog`) carry `companyId` for tenant-scoped trails.
- **UI gating**: menu items accept `roles: ['superadmin', 'admin']` (role slugs) in `config/menu.config.tsx`; pages guard via `requireSuperAdminPage()` / `requireUserManagerPage()` in `lib/page-guards.ts`.

**Key helpers (`lib/api-helpers.ts`):** `isSuperAdmin()`, `isCompanyAdmin()`, `canManageUsers()`, `requireSuperAdmin()`, `requireUserManager()`, `tenantScope(session)` → `{}` for superadmin / `{ companyId }` otherwise (company-less non-admins match nothing).


## 2b. Feature modules (all key-gated, zero-config in dev)

Every module is a service behind an interface with pluggable drivers — those
interfaces are the seams where dedicated services (or a Go worker) would plug
in at large scale.

| Module | Service | Drivers / gate | Entry points |
|---|---|---|---|
| Files | `services/storage.ts` | `local` (default) / `s3` via `STORAGE_DRIVER` | `/api/files`, avatar upload in user profile |
| Notifications | `services/notifications.ts` | in-app rows + email channel (SMTP key-gated) | topbar bell (30s polling), `/user-management/notifications` |
| Company settings | `lib/company-settings.ts` | always on (per-company row, auto-created) | `/user-management/settings` |
| Billing | `lib/billing.ts` | Stripe via `STRIPE_SECRET_KEY`; off = plan-only mode | `/user-management/billing`, `/api/billing/*`, webhook |
| Impersonation | `/api/user-management/impersonate(/return)` | superadmin only; audited via `ImpersonationLog` | Companies page → Impersonate → user picker; banner to return |
| Cache / rate limit | `lib/cache.ts`, `lib/rate-limit.ts` | Redis via `REDIS_URL`, else in-memory | login/signup/reset limits (10/5min, 5/hour), billing cache |

Plans: seeded Free (5 seats) + Pro (unlimited). `enforceUserSeatLimit()` runs on
every user invite — 403 with an upgrade prompt when seats are out.

**Growth path (microservices when needed, not before):** a stateless Next.js app
+ PostgreSQL + Redis + S3/CDN handles millions of users. When a piece outgrows
the monolith, replace the interface: a Go media-processing worker behind
`services/storage.ts`, a Go realtime gateway behind the notification bell
(replace polling with SSE/WS), a Go webhook receiver behind `/api/billing/webhook`.

---

## 3. Folder map (app lives at the repo ROOT)

```
app/
├── (auth)/                   ← PUBLIC auth pages
│   ├── signin/               ← sign-in + click-to-autofill demo accounts
│   ├── signup/ verify-email/ reset-password/ change-password/
│   └── forms/                ← zod schemas for all auth forms
├── (protected)/              ← SESSION-REQUIRED pages (proxy.ts + layout guard)
│   ├── layout.tsx            ← session check → AdminLayout
│   └── user-management/
│       ├── users/            ← grid, invite dialog, [id] profile, logs
│       ├── companies/        ← TENANT module: grid + add/edit/trash/restore (superadmin)
│       ├── roles/            ← superadmin only
│       ├── permissions/      ← superadmin only
│       └── logs/             ← "My Activity" for the signed-in user
├── api/
│   ├── auth/                 ← [...nextauth], signup, verify-email, reset-password, change-password
│   └── user-management/
│       ├── users/            ← tenant-scoped CRUD + [id]/{restore,logs}
│       ├── companies/        ← CRUD + [id]/{restore} + select (see README for the matrix)
│       ├── roles/            ← CRUD + [id]/{default,select} (mutations superadmin)
│       └── permissions/      ← CRUD + delete/select (mutations superadmin)
├── models/                   ← TS interfaces (user.ts, company.ts, system.ts)
└── layout.tsx / page.tsx     ← root layout + redirect to console/signin

components/
├── ui/                       ← 80 primitives (data-grid, forms, dialogs, calendar…)
├── common/                   ← container, toolbar, loaders, icons
└── layouts/admin/            ← AdminShell (role-filtered sidebar) + AdminLayout

config/
├── menu.config.tsx           ← ★ SIDEBAR — add modules here (supports roles: [])
├── types.ts                  ← MenuItem (incl. roles gating)
└── settings.config.ts / general.config.ts

lib/
├── auth.ts                   ← ★ NextAuth: credentials + Google, JWT/session claims
├── api-helpers.ts            ← ★ envelope, paging, requireSession, all tenant guards
├── page-guards.ts            ← ★ server-side page guards (redirect non-admins)
├── prisma.ts / api.ts / tokens.ts / app-url.ts / recaptcha.ts
└── s3-client.ts / s3-upload.ts (ready, needs creds)

prisma/
├── schema.prisma             ← ★ Company, User, UserRole (+isSuperAdmin/isCompanyAdmin), …
├── seed.js                   ← ★ deterministic grants; demo companies + users
└── data/                     ← roles.js / permissions.js / users.js datasets

services/                     ← send-email.ts, system-log.ts (accepts companyId)
proxy.ts                      ← Next 16 middleware: cookie guard → /signin
```

★ = the files you'll touch most when extending the kit.

---

## 4. How the pieces fit together

**Request flow (page):** browser → `proxy.ts` (session cookie? else `/signin?callbackUrl=…`) → `(protected)/layout.tsx` (server session check, wraps AdminShell) → page (page-guard from `lib/page-guards.ts`) → client components fetch via `apiFetch` + TanStack Query.

**Request flow (API):** route handler → `requireSession()` (401) → tier gate (`requireUserManager()`/`requireSuperAdmin()`) → merge `tenantScope(session)` into the Prisma `where` → query → `envelope(data, total, page)` → `systemLog()` with `companyId`.

**Auth flow:** NextAuth v4 credentials (bcrypt) + optional Google. JWT sessions carry the full claim set (§2). New signups land in the role flagged `isDefault` (Member) with **no company** — companies are populated by superadmin/company-admin invites. Admin invites choose company + role; the emailed set-password link verifies + activates.

**Email flow:** `services/send-email.ts` — no `SMTP_HOST` → prints to console (dev mode).

**Audit trail:** every signin/signup/mutation writes `SystemLog` (with `companyId`); per-user (`users/[id]/logs`) and per-self (`/user-management/logs`).

---

## 5. UI component library (`components/ui/`)

shadcn/ReUI style (Radix + Tailwind v4 + CVA):

- **Data tables:** `data-grid` (server-side paging/sorting/filtering, column move/pin/resize/hide), `data-grid-table`, `data-grid-column-header/filter/visibility`, `data-grid-pagination`, `table`.
- **Forms:** `form`, `input`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`, `toggle(-group)`, `slider`, `datefield`, `calendar`, `input-otp`, `file-upload`, `rating`, `label`.
- **Event calendar suite:** month/week/day/agenda, drag-and-drop events — ready for booking UIs.
- **Feedback/overlays:** `dialog`, `alert-dialog`, `drawer`, `sheet`, `alert`, `sonner`, `progress`, `skeleton`, `popover`, `hover-card`, `dropdown-menu`, `context-menu`, `command`, `tooltip`.
- **Display/layout:** `card`, `badge`, `avatar(-group)`, `breadcrumb`, `tabs`, `accordion`, `collapsible`, `stepper`, `kanban`, `tree`, `sortable`, `chart`, `carousel`, `pagination`, `scroll-area`, `scrollspy`, `resizable`, `separator`, `aspect-ratio`, `code`, `kbd`, `menubar`, `navigation-menu`.
- **Effects:** counting-number, marquee, shimmering-text, sliding-number, text-reveal, typing-text, word-rotate, gradient/grid backgrounds.

The canonical grid pattern: `user-management/users/components/user-list.tsx` (users) and `companies/components/company-list.tsx` (companies — includes row actions + restore mutation).

---

## 6. How to extend the kit (example: `patients` module in a hospital system)

1. **Model** — add to `prisma/schema.prisma`:
   ```prisma
   model Patient {
     id        String   @id @default(uuid())
     name      String
     phone     String?
     companyId String?                     // ← tenant link
     company   Company? @relation(fields: [companyId], references: [id])
     createdBy String
     created   User     @relation("PatientCreator", fields: [createdBy], references: [id])
     createdAt DateTime @default(now())
   }
   ```
   then `npm run db:push`.

2. **API** — `app/api/patients/route.ts` + `[id]/route.ts`. Copy a user-management route and keep the chain: `requireSession()` → `requireUserManager()` (or `requireSuperAdmin()`) → `where: { ...tenantScope(session), ...filters }` → zod → Prisma → `systemLog({ companyId })`.

3. **Menu** — `config/menu.config.tsx`:
   ```tsx
   { heading: 'Hospital', roles: ['superadmin', 'admin'] },
   { title: 'Patients', icon: Stethoscope, path: '/patients', roles: ['superadmin', 'admin'] },
   ```

4. **Page** — `app/(protected)/patients/page.tsx` starting with `await requireUserManagerPage();`, then copy `company-list.tsx` for the grid. Auth guard, layout, toasts come free.

5. **Frontend app** — a future `frontend/` folder can call the same REST API with the session cookie; the README's API reference is the contract.

---

## 7. Environment variables (`.env`)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | yes | PostgreSQL connection strings |
| `NEXTAUTH_URL` | yes | this service's base URL |
| `NEXTAUTH_SECRET` | yes | session signing key (`openssl rand -base64 32`) |
| `APP_NAME` | no | branding in titles + emails (default `Next.js Starter Template`) |
| `APP_URL` | no | override URL used in email links |
| `GOOGLE_CLIENT_ID/SECRET` | no | enables Google sign-in when both set |
| `SMTP_HOST/PORT/SECURE/USER/PASS/SENDER/FROM` | no | real email; unset host = console-log mode |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` | no | reCAPTCHA v2 on signup/reset; unset = skipped |
| `STORAGE_*` | no | S3/Spaces config for uploads |

## 8. Handy commands

```bash
npm run dev         # dev server on :3001
npm run build       # production build
npm start           # production server on :3001
npm run db:push     # apply schema.prisma to the database
npm run db:seed     # seed roles/permissions/companies/demo users (idempotent)
npm run db:studio   # Prisma Studio (browse/edit data in browser)
npm run lint        # eslint (NOTE: currently broken in this checkout — ajv/eslintrc conflict; `npx tsc --noEmit` is the working check)
```

## 9. Provenance & status

- Base: Metronic 9.5 (Tailwind React Next.js demos, TypeScript) — KeenThemes, plus ReUI component library. The distributed package ships the UI **without** API route handlers or layout shells; the API layer, admin shell, auth wiring, email/log services were implemented in this repo (Oct 2026).
- **Multi-tenant SaaS upgrade (Oct 2026):** `Company` tenants, superadmin/company-admin/member tiers, tenant-scoped APIs + audit logs, role-gated menus/pages, Companies console module, deterministic seeded permissions.
- Verified end-to-end on the live server: superadmin sees both companies (25 + 27 users), Acme admin sees only Acme and gets 403 on company/role management, member gets 403 on user management but can read own activity, company admins can update only their own company profile.
