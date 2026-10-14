import { Suspense } from 'react';
import { ScreenLoader } from '@/components/common/screen-loader';
import { getAppName } from '@/lib/app-url';
import { SignInForm } from './sign-in-form';

export default function Page() {
  const googleEnabled = !!(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );

  return (
    <Suspense fallback={<ScreenLoader />}>
      <SignInForm appName={getAppName()} googleEnabled={googleEnabled} />
    </Suspense>
  );
}
