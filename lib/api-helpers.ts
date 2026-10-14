import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
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
