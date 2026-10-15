import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, serverError, unauthorized } from '@/lib/api-helpers';
import { isBillingEnabled } from '@/lib/billing';

/** Active plans (prices in cents). */
export async function GET() {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    });

    return NextResponse.json({ enabled: isBillingEnabled(), data: plans });
  } catch (error) {
    return serverError(error, 'billing:plans');
  }
}
