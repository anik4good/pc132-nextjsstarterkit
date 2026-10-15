import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyRecaptchaToken } from '@/lib/recaptcha';
import { createVerificationToken } from '@/lib/tokens';
import { sendEmail } from '@/services/send-email';
import { getAppUrl, getAppName } from '@/lib/app-url';
import { checkIpRateLimit } from '@/lib/rate-limit';

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(request: NextRequest) {
  try {
    // Abuse protection: 5 reset requests per IP per hour.
    const rate = await checkIpRateLimit(request, 'reset-password', 5, 3600);
    if (!rate.ok) {
      return NextResponse.json(
        { message: 'Too many reset attempts. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Please enter a valid email address.' },
        { status: 400 },
      );
    }

    if (process.env.RECAPTCHA_SECRET_KEY) {
      const recaptchaToken = request.headers.get('x-recaptcha-token') || '';
      const human = await verifyRecaptchaToken(recaptchaToken);
      if (!human) {
        return NextResponse.json(
          { message: 'reCAPTCHA verification failed. Please try again.' },
          { status: 400 },
        );
      }
    }

    const { email } = parsed.data;

    // Respond identically whether or not the account exists, to avoid
    // leaking which emails are registered.
    const genericResponse = {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.isTrashed) {
      return NextResponse.json(genericResponse);
    }

    const token = await createVerificationToken(email, 'RESET_PASSWORD');

    await sendEmail({
      to: email,
      subject: `${getAppName()} — password reset`,
      content: {
        title: 'Password reset',
        subtitle:
          'Click the button below to choose a new password. The link expires in 1 hour.',
        buttonLabel: 'Reset Password',
        buttonUrl: `${getAppUrl()}/change-password?token=${token}`,
      },
    });

    return NextResponse.json(genericResponse);
  } catch (error) {
    console.error('[reset-password]', error);
    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 },
    );
  }
}
