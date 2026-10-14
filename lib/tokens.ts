import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

/**
 * Verification tokens are stored hashed (sha256); the raw token only ever
 * exists in the email link. The VerificationToken model doubles for both
 * email verification and password reset (identified by `identifier` email).
 */

const TOKEN_TTL_MS = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000, // 24 hours
  RESET_PASSWORD: 60 * 60 * 1000, // 1 hour
} as const;

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function createVerificationToken(
  email: string,
  purpose: keyof typeof TOKEN_TTL_MS,
): Promise<string> {
  const raw = crypto.randomBytes(32).toString('hex');

  // One live token per purpose per email keeps the table clean.
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: hashToken(raw),
      expires: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
    },
  });

  return raw;
}

export async function consumeVerificationToken(
  raw: string,
): Promise<{ email: string } | null> {
  const record = await prisma.verificationToken.findUnique({
    where: { token: hashToken(raw) },
  });

  if (!record || record.expires < new Date()) {
    if (record) {
      await prisma.verificationToken
        .delete({ where: { token: record.token } })
        .catch(() => undefined);
    }
    return null;
  }

  await prisma.verificationToken
    .delete({ where: { token: record.token } })
    .catch(() => undefined);

  return { email: record.identifier };
}

export async function peekVerificationToken(
  raw: string,
): Promise<{ email: string } | null> {
  const record = await prisma.verificationToken.findUnique({
    where: { token: hashToken(raw) },
  });

  if (!record || record.expires < new Date()) return null;
  return { email: record.identifier };
}
