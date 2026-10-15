import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import { systemLog } from '@/services/system-log';
import { notify } from '@/services/notifications';
import { sendEmail } from '@/services/send-email';
import { createVerificationToken } from '@/lib/tokens';
import { getAppUrl, getAppName } from '@/lib/app-url';
import {
  badRequest,
  conflict,
  envelope,
  forbidden,
  isSuperAdmin,
  pagingParams,
  requireSession,
  requireUserManager,
  serverError,
  sortDir,
  tenantScope,
  unauthorized,
} from '@/lib/api-helpers';
import { UserStatus } from '@/app/models/user';
import { enforceUserSeatLimit } from '@/lib/billing';

const USER_SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  country: true,
  timezone: true,
  roleId: true,
  companyId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  lastSignInAt: true,
  emailVerifiedAt: true,
  isTrashed: true,
  avatar: true,
  invitedByUserId: true,
  isProtected: true,
  role: { select: { id: true, name: true, slug: true, isSuperAdmin: true } },
  company: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.UserSelect;

// The users grid sorts by the Role column using the column id, which the
// UI sets to 'role_nameme' (typo included) — both variants map to role.name.
const USER_SORT_FIELDS: Record<string, Prisma.UserOrderByWithRelationInput> = {
  name: { name: 'asc' },
  email: { email: 'asc' },
  status: { status: 'asc' },
  createdAt: { createdAt: 'asc' },
  lastSignInAt: { lastSignInAt: 'asc' },
  role_name: { role: { name: 'asc' } },
  role_nameme: { role: { name: 'asc' } },
  company_name: { company: { name: 'asc' } },
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireUserManager(session);
    if (denied) return denied;

    const { page, limit, skip, take, params } = pagingParams(request);
    const dir = sortDir(request);

    const sortField = params.get('sort') || 'createdAt';
    const sortBase = USER_SORT_FIELDS[sortField] || USER_SORT_FIELDS.createdAt;
    const orderBy = Object.fromEntries(
      Object.entries(sortBase).map(([key, value]) => [
        key,
        typeof value === 'object' && value !== null
          ? Object.fromEntries(
              Object.entries(value).map(([k]) => [k, dir]),
            )
          : dir,
      ]),
    ) as Prisma.UserOrderByWithRelationInput;

    const query = params.get('query')?.trim();
    const roleId = params.get('roleId');
    const status = params.get('status');
    // Superadmins may browse a specific company; everyone else is pinned to
    // their own (or nothing at all, for company-less roles).
    const companyIdFilter = isSuperAdmin(session)
      ? params.get('companyId') || undefined
      : undefined;

    const where: Prisma.UserWhereInput = {
      ...tenantScope(session),
      ...(companyIdFilter ? { companyId: companyIdFilter } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(roleId ? { roleId } : {}),
      ...(status && status in UserStatus
        ? { status: status as keyof typeof UserStatus }
        : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: USER_SAFE_SELECT,
        orderBy,
        skip,
        take,
      }),
      prisma.user.count({ where }),
    ]);

    return envelope(users, total, page);
  } catch (error) {
    return serverError(error, 'users:list');
  }
}

const addUserSchema = z.object({
  name: z.string().trim().min(2).max(50),
  email: z.string().trim().toLowerCase().email(),
  roleId: z.string().min(1),
  // Superadmins choose the target company; company admins are pinned to theirs.
  companyId: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireUserManager(session);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const parsed = addUserSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(
        'Name (2-50 chars), a valid email and a role are required.',
      );
    }

    const { name, email, roleId } = parsed.data;

    const role = await prisma.userRole.findUnique({ where: { id: roleId } });
    if (!role || role.isTrashed) {
      return badRequest('Selected role does not exist.');
    }
    if (!isSuperAdmin(session) && role.isSuperAdmin) {
      return forbidden('You cannot invite a user with a super admin role.');
    }

    // Resolve the tenant the new user belongs to.
    let companyId: string | null = session.user.companyId ?? null;
    if (isSuperAdmin(session)) {
      companyId = parsed.data.companyId ?? null;
      if (companyId) {
        const company = await prisma.company.findUnique({
          where: { id: companyId },
        });
        if (!company || company.isTrashed) {
          return badRequest('Selected company does not exist.');
        }
      }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return conflict('A user with this email already exists.');
    }

    // Plan limits: block the invite when the company is out of seats.
    const seatError = await enforceUserSeatLimit(companyId);
    if (seatError) {
      return forbidden(seatError);
    }

    // Invited users have no password yet — they set one through the
    // invite link, which also verifies their email and activates them.
    const user = await prisma.user.create({
      data: {
        name,
        email,
        roleId,
        companyId,
        status: 'INACTIVE',
        invitedByUserId: session.user.id,
      },
      select: USER_SAFE_SELECT,
    });

    const raw = crypto.randomBytes(32).toString('hex');
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: crypto.createHash('sha256').update(raw).digest('hex'),
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await sendEmail({
      to: email,
      subject: `You have been invited to ${getAppName()}`,
      content: {
        title: `Welcome, ${name}!`,
        subtitle:
          'You have been invited to join. Set your password to activate your account. The link expires in 24 hours.',
        buttonLabel: 'Set Password & Activate',
        buttonUrl: `${getAppUrl()}/change-password?token=${raw}`,
      },
    });

    await systemLog(
      {
        event: 'USER_INVITED',
        userId: session.user.id,
        companyId,
        entityId: user.id,
        entityType: 'User',
        description: `Invited user ${email} with role ${role.name}`,
        ipAddress: getClientIP(request),
      },
    );

    // Tell the company's admins about the new teammate (in-app).
    if (companyId) {
      await notify({
        companyAdminsOf: companyId,
        companyId,
        type: 'USER_INVITED',
        title: 'New team member invited',
        body: `${name} (${email}) was invited with the role ${role.name}.`,
        link: `/user-management/users/${user.id}`,
      });
    }

    return NextResponse.json(
      { message: 'User added successfully. An invite email has been sent.' },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return conflict('A user with this email already exists.');
      }
    }
    return serverError(error, 'users:create');
  }
}
