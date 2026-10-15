import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { serverError } from '@/lib/api-helpers';
import { getStripe, invalidateCompanyBilling } from '@/lib/billing';

export const runtime = 'nodejs';

/**
 * Stripe webhook — the only billing route that is public (signature-verified
 * via STRIPE_WEBHOOK_SECRET). Configure the endpoint in the Stripe dashboard:
 *   checkout.session.completed, customer.subscription.updated,
 *   customer.subscription.deleted
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      return NextResponse.json(
        { message: 'STRIPE_WEBHOOK_SECRET is not configured.' },
        { status: 503 },
      );
    }

    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json({ message: 'Missing signature.' }, { status: 400 });
    }

    const payload = await request.text();
    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(payload, signature, secret);
    } catch (error) {
      console.error('[billing:webhook] signature verification failed:', error);
      return NextResponse.json({ message: 'Invalid signature.' }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.companyId;
        const planId = session.metadata?.planId;
        if (companyId && planId) {
          await prisma.subscription.upsert({
            where: { companyId },
            update: {
              planId,
              status: 'active',
              stripeCustomerId: (session.customer as string) ?? null,
              stripeSubscriptionId: (session.subscription as string) ?? null,
            },
            create: {
              companyId,
              planId,
              status: 'active',
              stripeCustomerId: (session.customer as string) ?? null,
              stripeSubscriptionId: (session.subscription as string) ?? null,
            },
          });
          await invalidateCompanyBilling(companyId);
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.companyId;
        const record = await prisma.subscription.findFirst({
          where: {
            OR: [
              { stripeSubscriptionId: subscription.id },
              ...(companyId ? [{ companyId }] : []),
            ],
          },
        });
        if (record) {
          // Newer Stripe API types moved period end onto the subscription item.
          const periodEndUnix =
            subscription.items.data[0]?.current_period_end ??
            (subscription as unknown as { current_period_end?: number })
              .current_period_end ??
            Math.floor(Date.now() / 1000);

          await prisma.subscription.update({
            where: { id: record.id },
            data: {
              status:
                event.type === 'customer.subscription.deleted'
                  ? 'canceled'
                  : subscription.status,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              currentPeriodEnd: new Date(periodEndUnix * 1000),
              // Plan changes arrive on the same event — pick the new price's plan.
              planId: await resolvePlanId(subscription, record.planId),
            },
          });
          await invalidateCompanyBilling(record.companyId);
        }
        break;
      }

      default:
        // Unhandled event types are acknowledged silently.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return serverError(error, 'billing:webhook');
  }
}

async function resolvePlanId(
  subscription: Stripe.Subscription,
  fallbackPlanId: string,
): Promise<string> {
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return fallbackPlanId;
  const plan = await prisma.plan.findFirst({ where: { stripePriceId: priceId } });
  return plan?.id ?? fallbackPlanId;
}
