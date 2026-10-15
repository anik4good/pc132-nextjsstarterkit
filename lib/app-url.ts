/** Absolute base URL used in email links (verification, password reset). */
export function getAppUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

export function getAppName(): string {
  return process.env.APP_NAME || 'Next.js Starter Template';
}
