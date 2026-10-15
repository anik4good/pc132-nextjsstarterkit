import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import { systemLog } from '@/services/system-log';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  requireSession,
  requireSuperAdmin,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

function normalizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(50),
  slug: z.string().trim().min(2).max(50),
  description: z.string().trim().max(255).optional().nullable(),
  permissions: z.array(z.string()).optional().default([]),
});

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireSuperAdmin(session);
    if (denied) return denied;

    const { id } = await context.params;

    const role = await prisma.userRole.findUnique({ where: { id } });
    if (!role) return notFound('Role not found.');
    if (role.isSuperAdmin) {
      return forbidden('The super admin role cannot be modified.');
    }
    if (role.isProtected) {
      return forbidden('This role is protected and cannot be modified.');
    }

    const body = await request.json().catch(() => null);
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest('Role name, slug and description are required.');
    }

    const name = parsed.data.name;
    const slug = normalizeSlug(parsed.data.slug) || normalizeSlug(name);

    const clash = await prisma.userRole.findFirst({
      where: { OR: [{ name }, { slug }], NOT: { id } },
    });
    if (clash) {
      return conflict('A role with this name or slug already exists.');
    }

    const permissionIds = parsed.data.permissions;
    if (permissionIds.length) {
      const found = await prisma.userPermission.count({
        where: { id: { in: permissionIds } },
      });
      if (found !== permissionIds.length) {
        return badRequest('One or more selected permissions do not exist.');
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRole.update({
        where: { id },
        data: { name, slug, description: parsed.data.description || null },
      });
      await tx.userRolePermission.deleteMany({ where: { roleId: id } });
      if (permissionIds.length) {
        await tx.userRolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: id,
            permissionId,
          })),
        });
      }
    });

    await systemLog({
      event: 'ROLE_UPDATED',
      userId: session.user.id,
      entityId: id,
      entityType: 'UserRole',
      description: `Updated role ${name}`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ message: 'Role updated successfully.' });
  } catch (error) {
    return serverError(error, 'roles:update');
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireSuperAdmin(session);
    if (denied) return denied;

    const { id } = await context.params;

    const role = await prisma.userRole.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) return notFound('Role not found.');
    if (role.isSuperAdmin) {
      return forbidden('The super admin role cannot be deleted.');
    }
    if (role.isProtected) {
      return forbidden('This role is protected and cannot be deleted.');
    }
    if (role.isDefault) {
      return badRequest(
        'This is the default role for new signups. Set another role as default first.',
      );
    }
    if (role._count.users > 0) {
      return badRequest(
        'This role is assigned to one or more users. Reassign them first.',
      );
    }

    await prisma.userRole.delete({ where: { id } });

    await systemLog({
      event: 'ROLE_DELETED',
      userId: session.user.id,
      entityId: id,
      entityType: 'UserRole',
      description: `Deleted role ${role.name}`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ message: 'Role deleted successfully.' });
  } catch (error) {
    return serverError(error, 'roles:delete');
  }
}
