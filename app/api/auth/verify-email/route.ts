import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { consumeVerificationToken } from '@/lib/tokens';
import { getClientIP } from '@/lib/api';
import { systemLog } from '@/services/system-log';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';

    if (!token) {
      return NextResponse.json(
        { message: 'Invalid or missing token.' },
        { status: 400 },
      );
    }

    const record = await consumeVerificationToken(token);
    if (!record) {
      return NextResponse.json(
        { message: 'Invalid or expired verification token.' },
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

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        status: user.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE',
      },
    });

    await systemLog({
      event: 'EMAIL_VERIFIED',
      userId: user.id,
      entityType: 'User',
      entityId: user.id,
      description: 'Email address verified',
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ message: 'Email verified successfully.' });
  } catch (error) {
    console.error('[verify-email]', error);
    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 },
    );
  }
}
