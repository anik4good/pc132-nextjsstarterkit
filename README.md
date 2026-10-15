# Next.js Starter Template

A **standalone, reusable multi-tenant user-management backend** built on Next.js (App Router) + Prisma + PostgreSQL + NextAuth. Ship it behind any SaaS — appointment booking, hospital management, CRM, anything that needs companies, accounts, roles and permissions — and manage everything from the built-in admin console.

Base: Metronic 9.5 Next.js template (UI + seed data), with the full API layer implemented in this repo (the Metronic distribution ships without route handlers).

---

## Quick start

```bash
npm install --force        # React 19 peer deps
cp .env.example .env       # then edit DATABASE_URL / NEXTAUTH_SECRET
npx prisma db push         # create tables
npx prisma db seed         # roles, permissions, companies, demo users
npm run dev                # http://localhost:3001
```

Runs on **port 3001** (pinned in package.json so it never clashes with a frontend dev server on 3000).

### Seeded logins

| Account | Password | Tier |
|---|---|---|
| `owner@kt.com` | `Owner#12345` | **Super Admin** — platform level, manages everything incl. companies (protected) |
| `demo@kt.com` | `Demo#12345` | Super Admin (demo account) |
| `admin@acme.com` | `Admin#12345` | **Company Admin** — Acme Corp only |
| `admin@globex.com` | `Admin#12345` | Company Admin — Globex only |
| `member@acme.com` | `Member#12345` | **Member** — normal user, Acme Corp only |

The sign-in page shows these as click-to-autofill buttons. Change them before any real deployment (re-seeding refreshes the passwords).

### Seeded data

8 active roles (Super Admin, Administrator, Manager, Staff, Support, Vendor, Customer, Member — *Member* is the default for new signups), 31 permissions (`user.view`, `company.add`, `role.edit`, …), 2 demo companies (**Acme Corp**, **Globex**) and ~50 demo users split between them.

## Multi-tenant (SaaS) model

- **`Company`** is the tenant. Every user carries a nullable `companyId` — `null` only for platform superadmins.
- **Three access tiers** (enforced server-side in `lib/api-helpers.ts`):
  1. **Super Admin** (`UserRole.isSuperAdmin`) — no company; bypasses every tenant filter; manages companies, roles, permissions, all users.
  2. **Company Admin** (`UserRole.isCompanyAdmin`) — sees and manages **only users of their own company**, can edit their own company profile, can never touch superadmins or assign the superadmin role.
  3. **Member** — no admin surface; only "My Activity". User/role/company APIs return 403.
- Role catalogs are **global** (shared across companies); users are bound to a company via `companyId`. Product-specific roles (doctor, patient, …) slot in as new rows in the role catalog — mark company-admin-level roles with `isCompanyAdmin: true`.
- Sessions carry `roleSlug`, `isSuperAdmin`, `isCompanyAdmin`, `companyId`, `companyName`. Audit logs carry `companyId` for tenant-scoped trails.
- Menu items support `roles: ['superadmin', 'admin']` gating (role slugs) in `config/menu.config.tsx`; pages additionally guard server-side via `lib/page-guards.ts`.

---

## What's inside

- **REST API** — auth + full users/roles/permissions/companies CRUD (all routes under `app/api/`)
- **Admin console** — sign-in-protected UI at `/user-management` (users, companies, roles, permissions, activity logs), role-gated menus and pages
- **Auth** — NextAuth v4: email/password (bcrypt) + optional Google OAuth, JWT sessions, email verification, password reset, user invites
- **RBAC** — Users → Role → Permissions (join table), protected records, default role for signups
- **Multi-tenancy** — `Company` tenants, `companyId` scoping on every query, superadmin bypass, per-company admins
- **Files module** — pluggable storage (`local` by default, S3-compatible cloud via `STORAGE_DRIVER=s3`), PRIVATE/PUBLIC visibility, used for avatar uploads
- **Notifications module** — in-app bell + full page with an email channel; `notify()` service is the seam for future SMS/push
- **Company settings** — per-tenant timezone/currency/locale/date+time formats/email footer
- **Billing module** — Stripe plans + subscriptions (key-gated: without `STRIPE_SECRET_KEY` it runs in plan-only mode), seat limits enforced on invites
- **Infra** — Redis-or-memory cache layer (`REDIS_URL`), per-IP rate limiting on login/signup/reset
- **Audit log** — `SystemLog` records signins, signup, password resets, and every admin mutation (with `companyId`)
- **Email** — verification / reset / invite emails; **without SMTP configured they print to the server console** with their links, so flows work in dev out of the box

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | yes | PostgreSQL connection (push + migrations) |
| `NEXTAUTH_URL` | yes | Base URL, e.g. `http://localhost:3001` |
| `NEXTAUTH_SECRET` | yes | `openssl rand -base64 32` |
| `APP_NAME` | no | Branding in page titles and emails (default `Next.js Starter Template`) |
| `APP_URL` | no | Override base URL used in email links |
| `NEXT_PUBLIC_BASE_PATH` | no | Keep empty unless serving under a sub-path |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables the Google button when both set |
| `SMTP_HOST/PORT/SECURE/USER/PASS/SENDER/FROM` | no | Real email sending; unset host = console-log mode |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` | no | reCAPTCHA v2 on signup/reset; unset = skipped on both ends |
| `STORAGE_DRIVER` | no | `local` (default) or `s3` |
| `UPLOAD_DIR` / `UPLOAD_MAX_SIZE_MB` | no | local driver dir (default `.data/uploads`) and cap (default 10) |
| `STORAGE_*` | no | S3-compatible object store keys for the `s3` driver |
| `REDIS_URL` | no | enables the shared Redis cache/rate-limit; unset = in-memory (dev) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | no | enables billing: checkout, portal, webhooks, seat limits |

## API reference

All endpoints return JSON. Errors: `{ "message": "..." }`. List endpoints return the DataGrid envelope `{ data, empty, pagination: { total, page } }`. Everything except `auth/*` requires a session (401 otherwise).

### Auth
| Method & path | Body | Notes |
|---|---|---|
| `POST /api/auth/signup` | `{name, email, password, passwordConfirmation, accept}` | creates INACTIVE user + verification email |
| `POST /api/auth/verify-email` | `{token}` | activates the account |
| `POST /api/auth/reset-password` | `{email}` | sends reset link (enumeration-safe) |
| `POST /api/auth/reset-password-verify` | `{token}` | validates a reset token |
| `POST /api/auth/change-password` | `{token, newPassword}` | sets password (also used to accept invites) |
| `POST /api/auth/callback/credentials` | form: `csrfToken, email, password` | NextAuth sign-in (JWT cookie) |
| `GET /api/auth/session` | — | current session |

Sign-in accepts users only when: not trashed, not `BLOCKED`, email verified, password matches. `lastSignInAt` is updated and a `SIGNIN` log written.

### User management
All user endpoints are superadmin/company-admin only (403 for members). Company admins are scoped to their own company on every call, regardless of parameters.

| Method & path | Notes |
|---|---|
| `GET /api/user-management/users?page&limit&sort&dir&query&roleId&status&companyId` | list; `sort` ∈ name, email, status, createdAt, lastSignInAt, role_name, company_name; `companyId` filter is superadmin-only |
| `POST /api/user-management/users` | `{name, email, roleId, companyId?}` — invite; superadmins pick the company, company admins are pinned to theirs |
| `GET /api/user-management/users/[id]` | single user incl. role + company |
| `PUT /api/user-management/users/[id]` | `{name, roleId, status}` |
| `DELETE /api/user-management/users/[id]` | 1st call = trash (soft), 2nd = permanent; self-delete, protected users, and superadmins (for non-superadmins) blocked |
| `PATCH /api/user-management/users/[id]/restore` | un-trash |
| `GET /api/user-management/users/[id]/logs` | that user's activity log (paged); self-access always allowed |

### Companies (tenants)
| Method & path | Notes |
|---|---|
| `GET /api/user-management/companies?page&limit&sort&dir&query&status` | superadmin only; includes `_count.users`; `sort` ∈ name, slug, status, createdAt, users_count |
| `POST /api/user-management/companies` | superadmin only; `{name, slug, description?, email?, phone?, website?}` |
| `GET /api/user-management/companies/[id]` | superadmin any; company admin own only |
| `PUT /api/user-management/companies/[id]` | superadmin full (incl. `status`); company admin own profile only (status ignored) |
| `DELETE /api/user-management/companies/[id]` | superadmin; 1st = trash+suspend, 2nd = permanent (blocked while users remain) |
| `PATCH /api/user-management/companies/[id]/restore` | superadmin; un-trash + reactivate |
| `GET /api/user-management/companies/select` | `[{id, name}]`; superadmin all, others own company |

### Roles & permissions
Reads: superadmin/company-admin. Mutations (create/update/delete/set-default): **superadmin only**. The superadmin role itself cannot be edited or deleted, and is hidden from the role dropdown for company admins.

| Method & path | Notes |
|---|---|
| `GET/POST /api/user-management/roles` | list (with permissions + user counts) / create `{name, slug, description, permissions:[ids]}` |
| `PUT/DELETE /api/user-management/roles/[id]` | update + replace permission set / delete (blocked when protected, default, or has users) |
| `PATCH /api/user-management/roles/[id]/default` | make it the signup default (only one) |
| `GET /api/user-management/roles/select` | `[{id, name}]` for dropdowns |
| `GET/POST /api/user-management/permissions` | list / create `{name, slug, description}` |
| `PUT/DELETE /api/user-management/permissions/[id]` | update / delete |
| `DELETE /api/user-management/permissions/delete` | bulk `{permissionIds: []}` |
| `GET /api/user-management/permissions/select` | `[{id, name, slug}]` for the role form |
| `GET/PUT /api/user-management/settings` | company settings (superadmin: `?companyId=`) |

### Files
| Method & path | Notes |
|---|---|
| `POST /api/files` | multipart `file` (+`visibility` PRIVATE/PUBLIC, `directory`); size/mime limits via env |
| `GET /api/files/[id]` | PUBLIC: open; PRIVATE: session + same company; local streams, s3 redirects/proxies |
| `DELETE /api/files/[id]` | uploader or superadmin |

### Notifications
| Method & path | Notes |
|---|---|
| `GET /api/notifications?page&limit` | own notifications, newest first |
| `GET /api/notifications/unread-count` | bell badge (polled) |
| `POST /api/notifications/[id]/read` | mark one read (own only) |
| `POST /api/notifications/read-all` | mark all read |

### Billing (key-gated by `STRIPE_SECRET_KEY`)
| Method & path | Notes |
|---|---|
| `GET /api/billing/plans` | active plans; `enabled` flag |
| `GET /api/billing/subscription` | current plan + seat usage (superadmin: `?companyId=`) |
| `POST /api/billing/checkout` | `{planId}` → Stripe Checkout URL |
| `POST /api/billing/portal` | Stripe customer portal URL |
| `POST /api/billing/webhook` | public; signature-verified; syncs subscription state | |

## Using the kit for a new product

1. **Copy the repo** into the new project (it is self-contained at the root).
2. Create a fresh database + user, point `DATABASE_URL` at it, `npm install`, `prisma db push`, `prisma db seed`.
3. **Add your domain models** to `prisma/schema.prisma` (e.g. `Patient`, `Appointment`) with a `companyId` tenant link (plus `userId`/`createdByUserId` where relevant), then `prisma db push`.
4. **Add API routes** under `app/api/<your-module>/` — copy any user-management route as the pattern: `requireSession()` → `requireUserManager()`/`requireSuperAdmin()` as fits → merge `tenantScope(session)` into your `where` so every query is tenant-scoped → validate with zod → Prisma → `systemLog()` with `companyId`.
5. **Extend the console**: add entries to `config/menu.config.tsx` (use `roles:` to gate by role slug) and pages under `app/(protected)/<your-module>/`, guarded with `requireUserManagerPage()`/`requireSuperAdminPage()` from `lib/page-guards.ts`. The shell (`components/layouts/admin/`) and all UI primitives (`components/ui/`) are ready to reuse.
6. Rename the brand via `APP_NAME`.

## Deployment notes

- Any Node host: `npm run build && npm start` (port 3001).
- The dev DB lives on the LAN (`192.168.100.31:5432`, db/user `nextjsstarterkit`) — reachable from any machine on the network.
- Docker/standalone: re-enable `output: 'standalone'` in `next.config.mjs` and run `node .next/standalone/server.js`.
- Behind a domain: set `NEXTAUTH_URL` (and `APP_URL`) to the public URL; keep `NEXT_PUBLIC_BASE_PATH` empty.

## Removed from the Metronic template

Hollow demo apps (store, network, public-profile, account, dark-sidebar, i18n demo) and the demo1–demo10 layout switcher were removed — they were empty shells in the distributed package. Unused-but-available libraries stay installed (TanStack Query/Table, S3 client, reCAPTCHA, i18n, nodemailer) so the kit can grow without new deps.
