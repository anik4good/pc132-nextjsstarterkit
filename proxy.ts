import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/** Auth pages and everything under /api (API routes guard themselves). */
const PUBLIC_PATH =
  /^\/(api|signin|signup|reset-password|verify-email|change-password)(\/|$)/;

/** Static assets served from /public or build output. */
const STATIC_FILE = /\.(svg|png|jpe?g|gif|webp|avif|ico|css|js|mjs|map|txt|xml|woff2?|ttf|eot|mp4|webm)$/i;

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATH.test(pathname) || STATIC_FILE.test(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (token) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = '/signin';
  url.search = `callbackUrl=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
