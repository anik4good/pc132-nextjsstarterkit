import { NextRequest, NextResponse } from 'next/server';
import { peekVerificationToken } from '@/lib/tokens';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';

    if (!token) {
      return NextResponse.json(
        { message: 'No reset token provided.' },
        { status: 400 },
      );
    }

    const record = await peekVerificationToken(token);
    if (!record) {
      return NextResponse.json(
        { message: 'Invalid or expired token.' },
        { status: 400 },
      );
    }

    return NextResponse.json({ message: 'Token is valid.' });
  } catch (error) {
    console.error('[reset-password-verify]', error);
    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 },
    );
  }
}
