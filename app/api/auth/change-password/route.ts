import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { consumeVerificationToken } from '@/lib/tokens';
import { getClientIP } from '@/lib/api';
import { systemLog } from '@/services/system-log';

const schema = z.object({
  token: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
    .regex(/[a-z]/, 'Password must contain a lowercase letter.')
    .regex(/\d/, 'Password must contain a number.')
    .regex(
      /[!@#$%^&*(),.?":{}|<>]/,
      'Password must contain a special character.',
    ),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            'Password must be at least 8 characters and include upper, lower, number and special characters.',
        },
        { status: 400 },
      );
    }

    const { token, newPassword } = parsed.data;

    const record = await consumeVerificationToken(token);
    if (!record) {
      return NextResponse.json(
        { message: 'Invalid or expired token.' },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: record.email },
    });

    if (!user) {
      return NextResponse.json(
        { message: 'Account not found.' },
        { status: 404 },
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        // Setting a password via invite/reset doubles as email confirmation.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        status: user.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE',
      },
    });

    await systemLog({
      event: 'PASSWORD_RESET',
      userId: user.id,
      entityType: 'User',
      entityId: user.id,
      description: 'Password set via reset/invite link',
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('[change-password]', error);
    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 },
    );
  }
}
