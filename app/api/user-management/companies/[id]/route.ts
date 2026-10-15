import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import { systemLog } from '@/services/system-log';
import {
  badRequest,
  forbidden,
  isSuperAdmin,
  notFound,
  requireSession,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

const COMPANY_SAFE_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  email: true,
  phone: true,
  website: true,
  logo: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  isTrashed: true,
  createdByUserId: true,
  _count: { select: { users: true } },
} satisfies Prisma.CompanySelect;

async function findCompany(id: string) {
  return prisma.company.findUnique({
    where: { id },
    select: COMPANY_SAFE_SELECT,
  });
}

/** Superadmins read any company; company admins only their own. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const { id } = await params;
    const company = await findCompany(id);
    if (!company) return notFound('Company not found.');

    if (!isSuperAdmin(session) && session.user.companyId !== company.id) {
      return forbidden('You can only access your own company.');
    }

    return NextResponse.json({ data: company });
  } catch (error) {
    return serverError(error, 'companies:get');
  }
}

const superAdminUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(255).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  website: z.string().trim().max(255).optional().or(z.literal('')),
  logo: z.string().trim().max(255).optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

/** Company admins may rename/describe their own company but never change status. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const { id } = await params;
    const company = await findCompany(id);
    if (!company) return notFound('Company not found.');

    const superAdmin = isSuperAdmin(session);
    if (!superAdmin && session.user.companyId !== company.id) {
      return forbidden('You can only update your own company.');
    }

    const body = await request.json().catch(() => null);
    const parsed = superAdminUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest('One or more fields are invalid.');
    }

    const { name, description, email, phone, website, logo } = parsed.data;
    const status = superAdmin ? parsed.data.status : undefined;

    const updated = await prisma.company.update({
      where: { id: company.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(website !== undefined ? { website: website || null } : {}),
        ...(logo !== undefined ? { logo: logo || null } : {}),
        ...(superAdmin && status !== undefined ? { status } : {}),
      },
      select: COMPANY_SAFE_SELECT,
    });

    await systemLog({
      event: 'COMPANY_UPDATED',
      userId: session.user.id,
      companyId: company.id,
      entityId: company.id,
      entityType: 'Company',
      description: `Updated company ${updated.name}`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({
      message: 'Company updated successfully.',
      data: updated,
    });
  } catch (error) {
    return serverError(error, 'companies:update');
  }
}

/** Soft-delete first, permanent delete on the second call — mirrors the users route. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    if (!isSuperAdmin(session)) {
      return forbidden('Super admin access required.');
    }

    const { id } = await params;
    const company = await findCompany(id);
    if (!company) return notFound('Company not found.');

    if (!company.isTrashed) {
      await prisma.company.update({
        where: { id: company.id },
        data: { isTrashed: true, status: 'SUSPENDED' },
      });

      await systemLog({
        event: 'COMPANY_TRASHED',
        userId: session.user.id,
        companyId: company.id,
        entityId: company.id,
        entityType: 'Company',
        description: `Moved company ${company.name} to trash`,
        ipAddress: getClientIP(request),
      });

      return NextResponse.json({ message: 'Company moved to trash.' });
    }

    const userCount = await prisma.user.count({ where: { companyId: company.id } });
    if (userCount > 0) {
      return badRequest(
        `This company still has ${userCount} user(s). Remove them first.`,
      );
    }

    await prisma.company.delete({ where: { id: company.id } });

    await systemLog({
      event: 'COMPANY_DELETED',
      userId: session.user.id,
      companyId: company.id,
      entityId: company.id,
      entityType: 'Company',
      description: `Permanently deleted company ${company.name}`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ message: 'Company permanently deleted.' });
  } catch (error) {
    return serverError(error, 'companies:delete');
  }
}
