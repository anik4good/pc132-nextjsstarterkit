import { redirect } from 'next/navigation';

/** The kit's home is the user-management console. */
export default function ProtectedIndexPage() {
  redirect('/user-management/users');
}
