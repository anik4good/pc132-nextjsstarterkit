import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

/** Server-side page guard: superadmins only (redirects otherwise). */
export async function requireSuperAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/signin');
  if (!session.user.isSuperAdmin) redirect('/');
  return session;
}

/** Server-side page guard: superadmin or company admin. */
export async function requireUserManagerPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/signin');
  if (!(session.user.isSuperAdmin || session.user.isCompanyAdmin)) redirect('/');
  return session;
}
