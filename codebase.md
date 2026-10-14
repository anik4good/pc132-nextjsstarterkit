# Next.js Backend Starter Kit — Codebase Guide

**Location:** `/Users/anik/project/personal/pc132-nextjsstarterkit`
**What this is:** a self-contained, reusable backend starter kit (Next.js + Prisma + PostgreSQL + NextAuth) with a built-in admin console for **user management, roles, permissions, and audit logs**. Drop it into any project — hospital management, gym management, CRM, e-commerce admin — and you have accounts, RBAC, and a complete UI component library from day one.

```
pc132-nextjsstarterkit/
├── backend/        ← the starter kit (this is the "backend" — everything lives here)
├── codebase.md     ← you are here (structure map + how to use)
└── frontend/       ← add your product's frontend here later (not created yet)
```

---

## 1. Quick start

```bash
cd backend
npm install --force        # only needed on a fresh copy (React 19 peer deps)
cp .env.example .env       # then set DATABASE_URL + NEXTAUTH_SECRET
npm run db:push            # create tables in PostgreSQL
npm run db:seed            # roles, permissions, demo users
npm run dev                # → http://localhost:3001
```

Port is pinned to **3001** so it never conflicts with a frontend dev server on 3000.

### Default logins (after seeding)

| Email | Password | Role | Notes |
|---|---|---|---|
| `owner@kt.com` | `Owner#12345` | Owner | protected — can't be edited/deleted from UI |
| `demo@kt.com` | `Demo#12345` | Owner | demo account |

### Current database

The kit's `.env` points at the LAN PostgreSQL: `postgresql://root2tech:root2tech@192.168.100.31:5432/root2tech` (tables already pushed + seeded). For a new product, create a new database and update `DATABASE_URL`.

---

## 2. Backend folder map (everything below `backend/`)

```
backend/
├── app/                          ← Next.js App Router
│   ├── (auth)/                   ← PUBLIC auth pages (no session required)
│   │   ├── signin/               ← sign-in page + form (NextAuth credentials)
│   │   ├── signup/               ← self-service registration
│   │   ├── verify-email/         ← consumes ?token= from verification email
│   │   ├── reset-password/       ← request a reset link
│   │   ├── change-password/      ← set new password from ?token= link
│   │   ├── forms/                ← zod schemas for all auth forms
│   │   └── layouts/branded.tsx   ← split-screen branded layout for auth pages
│   │
│   ├── (protected)/              ← SESSION-REQUIRED pages (guarded by proxy.ts
│   │   │                            + layout.tsx server check)
│   │   ├── layout.tsx            ← session check + wraps AdminShell
│   │   ├── user-management/
│   │   │   ├── users/            ← users table, add-user dialog, per-user
│   │   │   │   │                    profile page ([id]/), edit/delete/restore
│   │   │   │   │                    dialogs, activity-logs tab ([id]/logs/)
│   │   │   │   ├── roles/        ← roles table, create/edit dialog with
│   │   │   │   │                    permission checkboxes, set-default dialog
│   │   │   │   ├── permissions/  ← permissions table + CRUD dialogs
│   │   │   │   └── logs/         ← "My Activity" page for the signed-in user
│   │   │   └── models/           ← TypeScript interfaces (User, UserRole, …)
│   │
│   ├── api/                      ← REST API (route handlers)
│   │   ├── auth/
│   │   │   ├── [...nextauth]/    ← NextAuth endpoint (signin/signout/session/csrf)
│   │   │   ├── signup/           ← POST create user + verification email
│   │   │   ├── verify-email/     ← POST consume verification token
│   │   │   ├── reset-password/   ← POST send reset link
│   │   │   ├── reset-password-verify/ ← POST validate reset token
│   │   │   └── change-password/  ← POST set password from token
│   │   ├── user-management/
│   │   │   ├── users/            ← GET list (paged/filtered) · POST invite
│   │   │   │   └── [id]/         ← GET · PUT · DELETE (trash→permanent)
│   │   │   │       ├── restore/  ← PATCH un-trash
│   │   │   │       └── logs/     ← GET that user's activity log
│   │   │   ├── roles/            ← GET list · POST create
│   │   │   │   └── [id]/         ← PUT (with permissionIds) · DELETE
│   │   │   │       └── default/  ← PATCH make default signup role
│   │   │   │   └── select/       ← GET [{id,name}] for dropdowns
│   │   │   └── permissions/      ← GET · POST · [id]/ PUT DELETE
│   │   │       └── delete/       ← DELETE bulk {permissionIds}
│   │   │       └── select/       ← GET for role-form checkboxes
│   │   └── health/               ← GET liveness probe
│   │
│   ├── layout.tsx                ← root layout: fonts, providers stack
│   └── page.tsx                  ← redirects / → users console (or /signin)
│
├── components/
│   ├── ui/                       ← 80 UI PRIMITIVES (see §4) — data-grid,
│   │                                 forms, buttons, dialogs, calendar, …
│   ├── common/                   ← container, toolbar, screen-loader,
│   │                                 recaptcha-popover, icons, content-loader
│   └── layouts/
│       └── admin/                ← AdminShell: sidebar + topbar + user menu
│                                    (sidebar entries come from config/menu)
│       └── calendar/components/  ← toolbar bits for the EventCalendar suite
│
├── config/
│   ├── menu.config.tsx           ← ★ SIDEBAR MENU — add your app's pages here
│   ├── settings.config.ts        ← default UI settings
│   └── general.config.ts         ← general app constants
│
├── lib/                          ← shared server/client utilities
│   ├── auth.ts                   ← ★ NextAuth config (providers, callbacks,
│   │                                 session shape: id/roleId/roleName/status)
│   ├── prisma.ts                 ← Prisma client singleton
│   ├── api.ts                    ← apiFetch() (base-path-aware fetch) + getClientIP
│   ├── api-helpers.ts            ← ★ route-handler helpers: requireSession(),
│   │                                 envelope(), pagingParams(), error makers
│   ├── tokens.ts                 ← hashed verification/reset token create/consume
│   ├── app-url.ts                ← APP_URL/APP_NAME helpers (email links, titles)
│   ├── recaptcha.ts              ← server-side reCAPTCHA verification
│   ├── s3-client.ts / s3-upload.ts ← S3/Spaces storage (ready, needs creds)
│   ├── helpers.ts / utils.ts     ← formatting, cn(), toAbsoluteUrl()
│   ├── post-auth-redirect.ts     ← safe callbackUrl handling
│   └── demo-id.ts                ← legacy demo-id type (kept for compatibility)
│
├── prisma/
│   ├── schema.prisma             ← ★ DATA MODEL — User, UserRole,
│   │                                 UserPermission, UserRolePermission,
│   │                                 Account, Session, VerificationToken,
│   │                                 SystemLog, SystemSetting
│   ├── migrations/               ← SQL migrations (init)
│   ├── data/                     ← seed datasets (users/roles/permissions)
│   ├── seed.js                   ← seeding script (npm run db:seed)
│   └── setup.js                  ← alternative minimal setup script
│
├── services/
│   ├── send-email.ts             ← email sender — SMTP when configured,
│   │                                 otherwise prints email + link to console
│   └── system-log.ts             ← audit-log writer (used by every mutation)
│
├── providers/                    ← React context providers (query, auth,
│                                     theme, i18n, settings, tooltips, modules)
├── hooks/                        ← shared React hooks (incl. use-recaptcha-v2)
├── i18n/ + types/next-auth.d.ts  ← translations + session type augmentation
├── proxy.ts                      ← ★ Next 16 middleware: auth guard for all
│                                     non-public pages (redirects → /signin)
├── middleware.ts                 ← (none — replaced by proxy.ts)
├── .env / .env.example           ← environment configuration
└── README.md                     ← quick start + full API reference
```

★ = the files you'll touch most when extending the kit.

---

## 3. How the pieces fit together

**Request flow (page):** browser → `proxy.ts` (has session-token cookie? if not, redirect `/signin?callbackUrl=…`) → `(protected)/layout.tsx` (server-side session check, wraps `AdminShell`) → page (client components fetch via `apiFetch` + TanStack Query).

**Request flow (API):** route handler → `requireSession()` from `lib/api-helpers.ts` (401 if no session) → Prisma query → `envelope()` for lists / `{message}` for errors → `systemLog()` records the mutation.

**Auth flow:** NextAuth v4 with credentials provider (`lib/auth.ts`). Passwords bcrypt-hashed. Sessions are JWT cookies carrying `id, name, email, avatar, roleId, roleName, status` — read them anywhere with `getServerSession(authOptions)` (server) or `useSession()` (client). New signups land in the role flagged `isDefault` (Member), INACTIVE until email verification. Admin-invited users set their password through the emailed link, which also verifies + activates them.

**Email flow:** every email goes through `services/send-email.ts`. No `SMTP_HOST` set → printed to the server console with its link (dev mode). Set SMTP vars → real sending, zero code changes.

**Audit trail:** every signin, signup, password reset, and admin CRUD mutation writes a `SystemLog` row; visible per-user (`users/[id]/logs`) and per-self (`/user-management/logs`).

---

## 4. UI component library (`components/ui/` — 80 modules)

Everything needed to build admin UIs for any system, all shadcn/ReUI style (Radix + Tailwind v4 + CVA):

**Data tables (the workhorse):** `data-grid` (server-side paging/sorting/filtering, column moving/pinning/resizing/visibility), `data-grid-table` (+ DnD rows variant), `data-grid-column-header/filter/visibility`, `data-grid-pagination`, `table`.

**Forms:** `form` (react-hook-form + zod wiring), `input`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`, `toggle`, `toggle-group`, `slider`, `datefield`, `calendar` (date picker), `input-otp`, `file-upload`, `rating`, `label`.

**Event calendar (scheduling UIs — appointments, bookings):** `calendar/` suite — month/week/day/agenda views, drag-and-drop events, event dialog. Wrap in `CalendarSidebarToggleProvider` if you want the mobile sidebar toggle.

**Feedback & overlays:** `dialog`, `alert-dialog`, `drawer`, `sheet`, `alert`, `sonner` (toasts), `progress`, `skeleton`, `skeleton-with-pattern`, `popover`, `hover-card`, `dropdown-menu`, `context-menu`, `command` (⌘ palette), `tooltip`, `tooltip`.

**Display & layout:** `card`, `badge`, `avatar` + `avatar-group`, `breadcrumb`, `tabs`, `accordion` (+ `accordion-menu`), `collapsible`, `stepper`, `kanban`, `tree`, `sortable`, `chart`, `carousel`, `pagination`, `scroll-area`, `scrollspy`, `resizable`, `separator`, `aspect-ratio`, `code`, `kbd`, `menubar`, `navigation-menu`, `github-button`.

**Effects (marketing-ish flair, free bonus):** `counting-number`, `marquee`, `shimmering-text`, `sliding-number`, `text-reveal`, `typing-text`, `video-text`, `word-rotate`, `svg-text`, `gradient-background`, `grid-background`, `hover-background`.

**Shared (components/common):** `container`, `toolbar` (page headers), `screen-loader`, `content-loader`, `icons`, `confirm-dismiss-dialog`, `recaptcha-popover`.

Data-grid usage pattern is fully demonstrated in `app/(protected)/user-management/users/components/user-list.tsx` — copy that file as the starting point for any new list page.

---

## 5. How to extend the kit (the whole point)

Example: adding a `patients` module to a hospital system.

1. **Model** — add to `prisma/schema.prisma`:
   ```prisma
   model Patient {
     id        String   @id @default(uuid())
     name      String
     phone     String?
     createdBy String
     created   User     @relation("PatientCreator", fields: [createdBy], references: [id])
     createdAt DateTime @default(now())
   }
   // and on User:  patients Patient[] @relation("PatientCreator")
   ```
   then `npm run db:push`.

2. **API** — create `app/api/patients/route.ts` (GET list + POST) and `[id]/route.ts` (GET/PUT/DELETE). Copy a user-management route and keep the pattern: `requireSession()` → validate with zod → Prisma → `systemLog()`. List endpoints return `envelope(data, total, page)`.

3. **Menu** — add to `config/menu.config.tsx`:
   ```tsx
   { heading: 'Hospital' },
   { title: 'Patients', icon: Stethoscope, path: '/patients' },
   ```

4. **Page** — create `app/(protected)/patients/page.tsx`. Copy `user-list.tsx` for the grid (swap the fetch URL and columns), `user-add-dialog.tsx` for the create form, and you're done — auth guard, layout, styling, toasts all come free.

5. **Frontend app** — your product's public frontend (the `frontend/` folder someday) calls the same REST API with a session cookie or a token; the API reference in `backend/README.md` is the contract.

---

## 6. Environment variables (backend/.env)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | yes | PostgreSQL connection strings |
| `NEXTAUTH_URL` | yes | this service's base URL |
| `NEXTAUTH_SECRET` | yes | session signing key (`openssl rand -base64 32`) |
| `APP_NAME` | no | branding in titles + emails (default `Root2Tech`) |
| `APP_URL` | no | override URL used in email links |
| `GOOGLE_CLIENT_ID/SECRET` | no | enables Google sign-in when both set |
| `SMTP_HOST/PORT/SECURE/USER/PASS/SENDER/FROM` | no | real email; unset host = console-log mode |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` | no | reCAPTCHA v2 on signup/reset; unset = skipped |
| `STORAGE_*` | no | S3/Spaces config for uploads |

---

## 7. Handy commands

```bash
npm run dev         # dev server on :3001
npm run build       # production build
npm start           # production server on :3001
npm run db:push     # apply schema.prisma to the database
npm run db:seed     # seed roles/permissions/demo users
npm run db:studio   # Prisma Studio (browse/edit data in browser)
npm run lint        # eslint
```

## 8. Provenance & status

- Base: Metronic 9.5 (Tailwind React Next.js demos, TypeScript) — KeenThemes, plus ReUI component library. The distributed package ships the UI, Prisma schema and seed data **without** API route handlers or layout shells; the API layer, admin shell, auth wiring, email/log services and this guide were implemented in this repo (Oct 2026).
- Verified working end-to-end: build clean; signin/signup/verify/reset/invite, users/roles/permissions CRUD, trash/restore, protection guards, activity logs, admin console browser-tested.
- Removed from the Metronic base: hollow demo apps (store/network/public-profile/account/etc.), demo1–10 layout switcher, KeenThemes deploy scripts and branding.
