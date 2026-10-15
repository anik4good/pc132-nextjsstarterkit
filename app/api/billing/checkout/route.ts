import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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
import { getStripe, invalidateCompanyBilling, isBillingEnabled } from '@/lib/billing';

const checkoutSchema = z.object({
  planId: z.string().min(1),
  companyId: z.string().min(1).optional(), // superadmins may bill any company
});

/** Create a Stripe Checkout session to subscribe a company to a plan. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireUserManager(session);
    if (denied) return denied;

    if (!isBillingEnabled()) {
      return NextResponse.json(
        { message: 'Billing is not configured. Set STRIPE_SECRET_KEY to enable it.' },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) return badRequest('A planId is required.');

    const companyId = isSuperAdmin(session)
      ? parsed.data.companyId ?? session.user.companyId
      : session.user.companyId;
    if (!companyId) return badRequest('This account is not tied to a company.');

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return badRequest('Company not found.');

    const plan = await prisma.plan.findUnique({ where: { id: parsed.data.planId } });
    if (!plan || !plan.isActive) return badRequest('Plan not found.');
    if (!plan.stripePriceId) {
      return badRequest(
        'This plan has no Stripe price configured. Set stripePriceId in the database.',
      );
    }

    const stripe = getStripe();

    // Reuse the Stripe customer across checkout + portal.
    const existing = await prisma.subscription.findUnique({
      where: { companyId },
    });
    let customerId = existing?.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: company.name,
        email: company.email ?? undefined,
        metadata: { companyId },
      });
      customerId = customer.id;
      if (existing) {
        await prisma.subscription.update({
          where: { id: existing.id },
          data: { stripeCustomerId: customerId },
        });
      } else {
        await prisma.subscription.create({
          data: {
            companyId,
            planId: plan.id,
            status: 'active',
            stripeCustomerId: customerId,
          },
        });
      }
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${getAppUrl()}/user-management/billing?checkout=success`,
      cancel_url: `${getAppUrl()}/user-management/billing?checkout=cancelled`,
      metadata: { companyId, planId: plan.id },
      subscription_data: { metadata: { companyId, planId: plan.id } },
    });

    await invalidateCompanyBilling(companyId);

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    return serverError(error, 'billing:checkout');
  }
}
