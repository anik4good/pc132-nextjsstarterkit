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
  serverError,
  sortDir,
  unauthorized,
} from '@/lib/api-helpers';
import { CompanyStatus } from '@/app/models/company';

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

const COMPANY_SORT_FIELDS: Record<
  string,
  Prisma.CompanyOrderByWithRelationInput
> = {
  name: { name: 'asc' },
  slug: { slug: 'asc' },
  status: { status: 'asc' },
  createdAt: { createdAt: 'asc' },
  users_count: { users: { _count: 'asc' } },
};

/** Companies list — platform superadmin only. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireSuperAdmin(session);
    if (denied) return denied;

    const { page, limit, skip, take, params } = pagingParams(request);
    const dir = sortDir(request);

    const sortField = params.get('sort') || 'createdAt';
    const sortBase =
      COMPANY_SORT_FIELDS[sortField] || COMPANY_SORT_FIELDS.createdAt;
    const orderBy = Object.fromEntries(
      Object.entries(sortBase).map(([key, value]) => [
        key,
        typeof value === 'object' && value !== null
          ? Object.fromEntries(
              Object.entries(value).map(([k]) => [k, dir]),
            )
          : dir,
      ]),
    ) as Prisma.CompanyOrderByWithRelationInput;

    const query = params.get('query')?.trim();
    const status = params.get('status');

    const where: Prisma.CompanyWhereInput = {
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { slug: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(status && status in CompanyStatus
        ? { status: status as keyof typeof CompanyStatus }
        : {}),
    };

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        select: COMPANY_SAFE_SELECT,
        orderBy,
        skip,
        take,
      }),
      prisma.company.count({ where }),
    ]);

    return envelope(companies, total, page);
  } catch (error) {
    return serverError(error, 'companies:list');
  }
}

const addCompanySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case'),
  description: z.string().trim().max(255).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  website: z.string().trim().max(255).optional().or(z.literal('')),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireSuperAdmin(session);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const parsed = addCompanySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(
        'Name (2-80 chars) and a kebab-case slug (2-50 chars) are required.',
      );
    }

    const { name, slug, description, email, phone, website } = parsed.data;

    const existing = await prisma.company.findUnique({ where: { slug } });
    if (existing) {
      return conflict('A company with this slug already exists.');
    }

    const company = await prisma.company.create({
      data: {
        name,
        slug,
        description: description || null,
        email: email || null,
        phone: phone || null,
        website: website || null,
        createdByUserId: session.user.id,
      },
      select: COMPANY_SAFE_SELECT,
    });

    await systemLog({
      event: 'COMPANY_CREATED',
      userId: session.user.id,
      companyId: company.id,
      entityId: company.id,
      entityType: 'Company',
      description: `Created company ${company.name} (${company.slug})`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json(
      { message: 'Company created successfully.', data: company },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return conflict('A company with this slug already exists.');
      }
    }
    return serverError(error, 'companies:create');
  }
}
