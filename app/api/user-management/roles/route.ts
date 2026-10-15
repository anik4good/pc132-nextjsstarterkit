import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import { systemLog } from '@/services/system-log';
import {
  badRequest,
  conflict,
  envelope,
  pagingParams,
  requireSession,
  requireSuperAdmin,
  requireUserManager,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

const ROLE_INCLUDE = {
  permissions: { include: { permission: true } },
  _count: { select: { users: true } },
} satisfies Prisma.UserRoleInclude;

function normalizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireUserManager(session);
    if (denied) return denied;

    const { page, skip, take, params } = pagingParams(request);
    const query = params.get('query')?.trim();

    const where: Prisma.UserRoleWhereInput = {
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { slug: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [roles, total] = await Promise.all([
      prisma.userRole.findMany({
        where,
        include: ROLE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.userRole.count({ where }),
    ]);

    return envelope(roles, total, page);
  } catch (error) {
    return serverError(error, 'roles:list');
  }
}

const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(50),
  slug: z.string().trim().min(2).max(50),
  description: z.string().trim().max(255).optional().nullable(),
  permissions: z.array(z.string()).optional().default([]),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireSuperAdmin(session);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(
        'Role name, slug and description are required (name 2-50 chars).',
      );
    }

    const name = parsed.data.name;
    const slug = normalizeSlug(parsed.data.slug) || normalizeSlug(name);

    const clash = await prisma.userRole.findFirst({
      where: { OR: [{ name }, { slug }] },
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

    const role = await prisma.userRole.create({
      data: {
        name,
        slug,
        description: parsed.data.description || null,
        createdByUserId: session.user.id,
        permissions: {
          create: permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      include: ROLE_INCLUDE,
    });

    await systemLog({
      event: 'ROLE_CREATED',
      userId: session.user.id,
      entityId: role.id,
      entityType: 'UserRole',
      description: `Created role ${role.name}`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json(
      { message: 'Role added successfully.' },
      { status: 201 },
    );
  } catch (error) {
    return serverError(error, 'roles:create');
  }
}
