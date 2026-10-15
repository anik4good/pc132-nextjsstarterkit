import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { cached, invalidate } from '@/lib/cache';

/**
 * Billing module (Stripe) — key-gated like the email module:
 * without STRIPE_SECRET_KEY everything reports disabled and the UI shows a
 * clean "not configured" state. Nothing else in the app needs to change.
 */

export function isBillingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    // No apiVersion pinned — the SDK's latest types match the account default.
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }
  return stripeClient;
}

export interface CompanyBillingInfo {
  enabled: boolean;
  subscription: {
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  } | null;
  plan: {
    id: string;
    slug: string;
    name: string;
    priceMonthly: number;
    currency: string;
    maxUsers: number | null;
    features: Record<string, string> | null;
  } | null;
  usersCount: number;
}

/** Subscription + plan + seat usage for a company (cached 60s). */
export async function getCompanyBilling(
  companyId: string,
): Promise<CompanyBillingInfo> {
  const info = await cached(`billing:${companyId}`, 60, async () => {
    const [subscription, usersCount] = await Promise.all([
      prisma.subscription.findUnique({
        where: { companyId },
        include: { plan: true },
      }),
      prisma.user.count({ where: { companyId, isTrashed: false } }),
    ]);

    return {
      enabled: isBillingEnabled(),
      subscription: subscription
        ? {
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          }
        : null,
      plan: subscription
        ? {
            id: subscription.plan.id,
            slug: subscription.plan.slug,
            name: subscription.plan.name,
            priceMonthly: subscription.plan.priceMonthly,
            currency: subscription.plan.currency,
            maxUsers: subscription.plan.maxUsers,
            features: (subscription.plan.features as Record<string, string> | null) ?? null,
          }
        : null,
      usersCount,
    };
  });

  return info as CompanyBillingInfo;
}

export async function invalidateCompanyBilling(companyId: string): Promise<void> {
  await invalidate(`billing:${companyId}`);
}

/**
 * Seat-limit guard for user creation. Returns an error message when the
 * company is out of seats, or null when the invite may proceed.
 */
export async function enforceUserSeatLimit(
  companyId: string | null,
): Promise<string | null> {
  if (!companyId) return null; // platform-level users are not seat-bound

  const billing = await getCompanyBilling(companyId);
  const maxUsers = billing.plan?.maxUsers ?? null;
  if (maxUsers === null) return null; // unlimited

  if (billing.usersCount >= maxUsers) {
    return `Your plan allows ${maxUsers} users and all seats are taken. Upgrade to add more teammates.`;
  }
  return null;
}
