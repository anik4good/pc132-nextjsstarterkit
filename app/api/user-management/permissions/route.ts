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

    const where: Prisma.UserPermissionWhereInput = {
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { slug: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [permissions, total] = await Promise.all([
      prisma.userPermission.findMany({
        where,
        orderBy: { slug: 'asc' },
        skip,
        take,
      }),
      prisma.userPermission.count({ where }),
    ]);

    return envelope(permissions, total, page);
  } catch (error) {
    return serverError(error, 'permissions:list');
  }
}

const createPermissionSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(100),
  description: z.string().trim().max(255).optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireSuperAdmin(session);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const parsed = createPermissionSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest('Permission name and slug are required.');
    }

    const name = parsed.data.name;
    const slug = normalizeSlug(parsed.data.slug) || normalizeSlug(name);

    const clash = await prisma.userPermission.findFirst({
      where: { OR: [{ name }, { slug }] },
    });
    if (clash) {
      return conflict('A permission with this name or slug already exists.');
    }

    const permission = await prisma.userPermission.create({
      data: {
        name,
        slug,
        description: parsed.data.description || null,
        createdByUserId: session.user.id,
      },
    });

    await systemLog({
      event: 'PERMISSION_CREATED',
      userId: session.user.id,
      entityId: permission.id,
      entityType: 'UserPermission',
      description: `Created permission ${permission.slug}`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json(
      { message: 'Permission added successfully.' },
      { status: 201 },
    );
  } catch (error) {
    return serverError(error, 'permissions:create');
  }
}
