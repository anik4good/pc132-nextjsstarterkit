import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, Session } from 'next-auth';
import { authOptions } from '@/lib/auth';

/** Response envelope consumed by the DataGrid UI components. */
export interface ListEnvelope<T> {
  data: T[];
  empty: boolean;
  pagination: {
    total: number;
    page: number;
  };
}

export function envelope<T>(data: T[], total: number, page: number) {
  return NextResponse.json({
    data,
    empty: data.length === 0,
    pagination: { total, page },
  } satisfies ListEnvelope<T>);
}

export function unauthorized() {
  return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
}

export function forbidden(message = 'Forbidden') {
  return NextResponse.json({ message }, { status: 403 });
}

export function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ message }, { status: 404 });
}

export function conflict(message: string) {
  return NextResponse.json({ message }, { status: 409 });
}

export function serverError(error: unknown, route: string) {
  console.error(`[${route}]`, error);
  return NextResponse.json(
    { message: 'Something went wrong. Please try again later.' },
    { status: 500 },
  );
}

/** Session guard for API route handlers. */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  return session;
}

/** True when the signed-in user carries a superadmin role (bypasses tenant scoping). */
export function isSuperAdmin(session: Session | null): boolean {
  return Boolean(session?.user?.isSuperAdmin);
}

/** True for roles flagged as company admins (manage users inside their own company). */
export function isCompanyAdmin(session: Session | null): boolean {
  return Boolean(session?.user?.isCompanyAdmin);
}

/** Gate for user-management surfaces: superadmin or company admin. */
export function canManageUsers(session: Session | null): boolean {
  return isSuperAdmin(session) || isCompanyAdmin(session);
}

/** 403 responder for the canManageUsers gate; returns null when allowed. */
export function requireUserManager(session: Session | null) {
  if (canManageUsers(session)) return null;
  return forbidden('User management access required.');
}

/** Superadmin-only gate: returns a 403 response, or null when the caller may proceed. */
export function requireSuperAdmin(session: Session | null) {
  if (isSuperAdmin(session)) return null;
  return forbidden('Super admin access required.');
}

/** Filter the caller may read/write outside their company. Superadmins: none. */
export const IMPOSSIBLE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Tenant filter for list queries and ownership checks.
 * Superadmins get an empty clause (see everything); everyone else is pinned
 * to their own company — users without a company match nothing.
 */
export function tenantScope(session: Session | null): { companyId?: string } {
  if (isSuperAdmin(session)) return {};
  return { companyId: session?.user?.companyId ?? IMPOSSIBLE_ID };
}

/** Shared paging params: ?page=1&limit=10 */
export function pagingParams(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(params.get('limit') || '10', 10) || 10),
  );
  return { page, limit, skip: (page - 1) * limit, take: limit, params };
}

/** ?dir=asc|desc */
export function sortDir(request: NextRequest): 'asc' | 'desc' {
  return request.nextUrl.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
}
