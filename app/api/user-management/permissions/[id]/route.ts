import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import { systemLog } from '@/services/system-log';
import {
  badRequest,
  conflict,
  notFound,
  requireSession,
  serverError,
  unauthorized,
  requireSuperAdmin,
} from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

function normalizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const updatePermissionSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(100),
  description: z.string().trim().max(255).optional().nullable(),
});

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireSuperAdmin(session);
    if (denied) return denied;

    const { id } = await context.params;

    const permission = await prisma.userPermission.findUnique({ where: { id } });
    if (!permission) return notFound('Permission not found.');

    const body = await request.json().catch(() => null);
    const parsed = updatePermissionSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest('Permission name and slug are required.');
    }

    const name = parsed.data.name;
    const slug = normalizeSlug(parsed.data.slug) || normalizeSlug(name);

    const clash = await prisma.userPermission.findFirst({
      where: { OR: [{ name }, { slug }], NOT: { id } },
    });
    if (clash) {
      return conflict('A permission with this name or slug already exists.');
    }

    await prisma.userPermission.update({
      where: { id },
      data: { name, slug, description: parsed.data.description || null },
    });

    await systemLog({
      event: 'PERMISSION_UPDATED',
      userId: session.user.id,
      entityId: id,
      entityType: 'UserPermission',
      description: `Updated permission ${slug}`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ message: 'Permission updated successfully.' });
  } catch (error) {
    return serverError(error, 'permissions:update');
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireSuperAdmin(session);
    if (denied) return denied;

    const { id } = await context.params;

    const permission = await prisma.userPermission.findUnique({ where: { id } });
    if (!permission) return notFound('Permission not found.');

    // Role assignments cascade-delete via the join table.
    await prisma.userPermission.delete({ where: { id } });

    await systemLog({
      event: 'PERMISSION_DELETED',
      userId: session.user.id,
      entityId: id,
      entityType: 'UserPermission',
      description: `Deleted permission ${permission.slug}`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ message: 'Permission deleted successfully.' });
  } catch (error) {
    return serverError(error, 'permissions:delete');
  }
}
