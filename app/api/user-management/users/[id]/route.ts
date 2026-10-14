import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import { systemLog } from '@/services/system-log';
import {
  badRequest,
  forbidden,
  notFound,
  requireSession,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

const USER_SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  country: true,
  timezone: true,
  roleId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  lastSignInAt: true,
  emailVerifiedAt: true,
  isTrashed: true,
  avatar: true,
  invitedByUserId: true,
  isProtected: true,
  role: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.UserSelect;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const { id } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: USER_SAFE_SELECT,
    });

    if (!user) return notFound('User not found.');

    return NextResponse.json(user);
  } catch (error) {
    return serverError(error, 'users:get');
  }
}

const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(50),
  roleId: z.string().min(1),
  status: z.enum(['INACTIVE', 'ACTIVE', 'BLOCKED']),
});

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const { id } = await context.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return notFound('User not found.');
    if (user.isProtected) {
      return forbidden('This user is protected and cannot be modified.');
    }

    const body = await request.json().catch(() => null);
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest('Name, role and a valid status are required.');
    }

    const role = await prisma.userRole.findUnique({
      where: { id: parsed.data.roleId },
    });
    if (!role || role.isTrashed) {
      return badRequest('Selected role does not exist.');
    }

    const updated = await prisma.user.update({
      where: { id },
      data: parsed.data,
      select: USER_SAFE_SELECT,
    });

    await systemLog({
      event: 'USER_UPDATED',
      userId: session.user.id,
      entityId: id,
      entityType: 'User',
      description: `Updated user ${user.email}`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ message: 'User updated successfully.' });
  } catch (error) {
    return serverError(error, 'users:update');
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const { id } = await context.params;

    if (session.user.id === id) {
      return badRequest('You cannot delete your own account.');
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return notFound('User not found.');
    if (user.isProtected) {
      return forbidden('This user is protected and cannot be deleted.');
    }

    if (!user.isTrashed) {
      // Soft delete: keep the record for restore / audit.
      await prisma.user.update({
        where: { id },
        data: { isTrashed: true, status: 'INACTIVE' },
      });

      await systemLog({
        event: 'USER_TRASHED',
        userId: session.user.id,
        entityId: id,
        entityType: 'User',
        description: `Moved user ${user.email} to trash`,
        ipAddress: getClientIP(request),
      });

      return NextResponse.json({ message: 'User deleted successfully.' });
    }

    // Already trashed — a second delete removes the record permanently.
    await prisma.user.delete({ where: { id } });

    await systemLog({
      event: 'USER_DELETED',
      userId: session.user.id,
      entityId: id,
      entityType: 'User',
      description: `Permanently deleted user ${user.email}`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ message: 'User permanently deleted.' });
  } catch (error) {
    return serverError(error, 'users:delete');
  }
}
