import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import {
  badRequest,
  forbidden,
  notFound,
  requireSession,
  requireSuperAdmin,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';
import { systemLog } from '@/services/system-log';

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // matches lib/auth.ts

function sessionCookieName(): string {
  const secure = (process.env.NEXTAUTH_URL || '').startsWith('https://');
  return secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
}

const impersonateSchema = z.object({
  userId: z.string().min(1),
});

/**
 * Start impersonating a user (superadmin only).
 * Re-signs the session JWT with the target user's claims plus an
 * `impersonatedBy` marker, and writes an ImpersonationLog entry.
 * The marker rides along in every request until /impersonate/return runs.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireSuperAdmin(session);
    if (denied) return denied;

    if (session.user.impersonatedBy) {
      return forbidden('Already impersonating — return to your account first.');
    }

    const body = await request.json().catch(() => null);
    const parsed = impersonateSchema.safeParse(body);
    if (!parsed.success) return badRequest('A userId is required.');

    const target = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      include: { role: true, company: true },
    });
    if (!target) return notFound('User not found.');
    if (target.id === session.user.id) {
      return badRequest('You cannot impersonate yourself.');
    }
    if (target.isTrashed) return badRequest('This account has been deleted.');
    if (target.status === 'BLOCKED') {
      return badRequest('This account is blocked.');
    }
    if (!target.emailVerifiedAt || target.status !== 'ACTIVE') {
      return badRequest('Only activated accounts can be impersonated.');
    }
    if (target.role.isSuperAdmin) {
      return forbidden('Super admin accounts cannot be impersonated.');
    }

    // Audit trail: who logged in as whom, from where, when.
    const log = await prisma.impersonationLog.create({
      data: {
        auditorId: session.user.id,
        userId: target.id,
        ipAddress: getClientIP(request),
      },
    });

    await systemLog({
      event: 'IMPERSONATION_STARTED',
      userId: session.user.id,
      companyId: target.companyId,
      entityId: target.id,
      entityType: 'User',
      description: `Started impersonating ${target.email}`,
      ipAddress: getClientIP(request),
    });

    // Re-sign the session token with the target's claims.
    const token = await encode({
      secret: process.env.NEXTAUTH_SECRET as string,
      maxAge: SESSION_MAX_AGE,
      token: {
        id: target.id,
        name: target.name ?? '',
        email: target.email,
        avatar: target.avatar ?? null,
        roleId: target.roleId,
        roleName: target.role?.name ?? null,
        roleSlug: target.role?.slug ?? null,
        isSuperAdmin: false, // never inherit the superadmin flag
        isCompanyAdmin: target.role?.isCompanyAdmin ?? false,
        companyId: target.companyId ?? null,
        companyName: target.company?.name ?? null,
        status: target.status,
        impersonatedBy: session.user.id,
      },
    });

    const response = NextResponse.json({
      message: `Now viewing the app as ${target.name || target.email}.`,
      data: { userId: target.id, logId: log.id },
    });
    response.cookies.set({
      name: sessionCookieName(),
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: (process.env.NEXTAUTH_URL || '').startsWith('https://'),
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    return serverError(error, 'impersonate:start');
  }
}
