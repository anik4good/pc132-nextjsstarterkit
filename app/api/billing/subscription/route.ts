import { NextRequest, NextResponse } from 'next/server';
import { badRequest, isSuperAdmin, requireSession, requireUserManager, serverError, unauthorized } from '@/lib/api-helpers';
import { getCompanyBilling } from '@/lib/billing';

/** Current subscription + plan + seat usage for the caller's company. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireUserManager(session);
    if (denied) return denied;

    const companyId = isSuperAdmin(session)
      ? request.nextUrl.searchParams.get('companyId') ?? session.user.companyId
      : session.user.companyId;

    if (!companyId) {
      return badRequest('This account is not tied to a company.');
    }

    const billing = await getCompanyBilling(companyId);
    return NextResponse.json({ data: { companyId, ...billing } });
  } catch (error) {
    return serverError(error, 'billing:subscription');
  }
}
