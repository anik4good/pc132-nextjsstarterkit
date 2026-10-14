import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAppName } from '@/lib/app-url';
import { AdminShell } from './admin-shell';

export async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  return (
    <AdminShell
      appName={getAppName()}
      user={{
        name: session?.user?.name,
        email: session?.user?.email,
        avatar: session?.user?.avatar,
        roleName: session?.user?.roleName,
      }}
    >
      {children}
    </AdminShell>
  );
}
