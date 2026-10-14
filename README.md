# Root2Tech Backend Starter Kit

A **standalone, reusable user-management backend** built on Next.js (App Router) + Prisma + PostgreSQL + NextAuth. Ship it behind any software — hospital management, gym management, CRM, anything that needs accounts, roles and permissions — and manage everything from the built-in admin console.

Base: Metronic 9.5 Next.js template (UI + Prisma schema + seed data), with the full API layer implemented in this repo (the Metronic distribution ships without route handlers).

---

## Quick start

```bash
cd backend
npm install --force        # React 19 peer deps
cp .env.example .env       # then edit DATABASE_URL / NEXTAUTH_SECRET
npx prisma db push         # create tables
npx prisma db seed         # roles, permissions, demo users
npm run dev                # http://localhost:3001
```

Runs on **port 3001** (pinned in package.json so it never clashes with a frontend dev server on 3000).

### Seeded logins

| Account | Password | Role | Notes |
|---|---|---|---|
| `owner@kt.com` | `Owner#12345` | Owner | protected — cannot be edited/deleted from the UI |
| `demo@kt.com` | `Demo#12345` | Owner | regular demo account |

> Change these before any real deployment (re-seed refreshes their passwords).

### Seeded data

9 roles (Owner, Administrator, Manager, Staff, Support, Vendor, Customer, Member, Guest — *Member* is the default for new signups), 27 permissions (`user.view`, `user.add`, `role.edit`, …), ~50 demo users.

---

## What's inside

- **REST API** — auth + full users/roles/permissions CRUD (all routes under `app/api/`)
- **Admin console** — sign-in-protected UI at `/user-management` (users, roles, permissions, activity logs)
- **Auth** — NextAuth v4: email/password (bcrypt) + optional Google OAuth, JWT sessions, email verification, password reset, user invites
- **RBAC** — Users → Role → Permissions (join table), protected records, default role for signups
- **Audit log** — `SystemLog` records signins, signup, password resets, and every admin mutation
- **Email** — verification / reset / invite emails; **without SMTP configured they print to the server console** with their links, so flows work in dev out of the box

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | yes | PostgreSQL connection (push + migrations) |
| `NEXTAUTH_URL` | yes | Base URL, e.g. `http://localhost:3001` |
| `NEXTAUTH_SECRET` | yes | `openssl rand -base64 32` |
| `APP_NAME` | no | Branding in page titles and emails (default `Root2Tech`) |
| `APP_URL` | no | Override base URL used in email links |
| `NEXT_PUBLIC_BASE_PATH` | no | Keep empty unless serving under a sub-path |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables the Google button when both set |
| `SMTP_HOST/PORT/SECURE/USER/PASS/SENDER/FROM` | no | Real email sending; unset host = console-log mode |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` | no | reCAPTCHA v2 on signup/reset; unset = skipped on both ends |
| `STORAGE_*` | no | S3/DO Spaces client for avatar uploads (libs ready, not wired to UI) |

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
| Method & path | Notes |
|---|---|
| `GET /api/user-management/users?page&limit&sort&dir&query&roleId&status` | list; `sort` ∈ name, email, status, createdAt, lastSignInAt, role_name |
| `POST /api/user-management/users` | `{name, email, roleId}` — invite; emails a set-password link |
| `GET /api/user-management/users/[id]` | single user incl. role |
| `PUT /api/user-management/users/[id]` | `{name, roleId, status}` |
| `DELETE /api/user-management/users/[id]` | 1st call = trash (soft), 2nd = permanent; self-delete and protected users blocked |
| `PATCH /api/user-management/users/[id]/restore` | un-trash |
| `GET /api/user-management/users/[id]/logs` | that user's activity log (paged) |

### Roles & permissions
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

## Using the kit for a new product

1. **Copy the `backend/` folder** into the new project (it is self-contained).
2. Create a fresh database + user, point `DATABASE_URL` at it, `npm install`, `prisma db push`, `prisma db seed`.
3. **Add your domain models** to `prisma/schema.prisma` (e.g. `Patient`, `GymMember`) with a `createdByUserId`/`userId` link where relevant, then `prisma db push`.
4. **Add API routes** under `app/api/<your-module>/` — copy any user-management route as the pattern (session guard via `requireSession()`, helpers in `lib/api-helpers.ts`, logging via `services/system-log.ts`).
5. **Extend the console**: add entries to `config/menu.config.tsx` and pages under `app/(protected)/<your-module>/`. The shell (`components/layouts/admin/`) and all UI primitives (`components/ui/`) are ready to reuse.
6. Rename the brand via `APP_NAME`.

## Deployment notes

- Any Node host: `npm run build && npm start` (port 3001).
- The dev DB lives on the LAN (`192.168.100.31:5432`, db/user `root2tech`) — reachable from any machine on the network.
- Docker/standalone: re-enable `output: 'standalone'` in `next.config.mjs` and run `node .next/standalone/server.js`.
- Behind a domain: set `NEXTAUTH_URL` (and `APP_URL`) to the public URL; keep `NEXT_PUBLIC_BASE_PATH` empty.

## Removed from the Metronic template

Hollow demo apps (store, network, public-profile, account, dark-sidebar, i18n demo) and the demo1–demo10 layout switcher were removed — they were empty shells in the distributed package. Unused-but-available libraries stay installed (TanStack Query/Table, S3 client, reCAPTCHA, i18n, nodemailer) so the kit can grow without new deps.
