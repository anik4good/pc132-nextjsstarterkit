import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  badRequest,
  isSuperAdmin,
  requireSession,
  requireUserManager,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';
import { getAppUrl } from '@/lib/app-url';
import { getStripe, isBillingEnabled } from '@/lib/billing';

/** Stripe customer portal session (manage payment method / cancel). */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireUserManager(session);
    if (denied) return denied;

    if (!isBillingEnabled()) {
      return NextResponse.json(
        { message: 'Billing is not configured.' },
        { status: 503 },
      );
    }

    const companyId = isSuperAdmin(session)
      ? request.nextUrl.searchParams.get('companyId') ?? session.user.companyId
      : session.user.companyId;
    if (!companyId) return badRequest('This account is not tied to a company.');

    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
    });
    if (!subscription?.stripeCustomerId) {
      return badRequest('No Stripe customer yet — subscribe to a plan first.');
    }

    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${getAppUrl()}/user-management/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    return serverError(error, 'billing:portal');
  }
}
