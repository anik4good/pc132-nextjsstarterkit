import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { verifyRecaptchaToken } from '@/lib/recaptcha';
import { getClientIP } from '@/lib/api';
import { checkIpRateLimit } from '@/lib/rate-limit';
import { systemLog } from '@/services/system-log';
import { sendEmail } from '@/services/send-email';
import { createVerificationToken } from '@/lib/tokens';
import { getAppUrl, getAppName } from '@/lib/app-url';

const signupSchema = z.object({
  name: z.string().trim().min(2).max(50),
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/\d/)
    .regex(/[!@#$%^&*(),.?":{}|<>]/),
});

export async function POST(request: NextRequest) {
  try {
    // Abuse protection: 5 signups per IP per hour.
    const rate = await checkIpRateLimit(request, 'signup', 5, 3600);
    if (!rate.ok) {
      return NextResponse.json(
        { message: 'Too many signup attempts. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            'Please provide a valid name, email and a strong password (min 8 chars with upper, lower, number and special character).',
        },
        { status: 400 },
      );
    }

    // reCAPTCHA is enforced only when configured; the UI sends a placeholder
    // token when the site key is absent.
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

    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { message: 'An account with this email already exists.' },
        { status: 409 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const defaultRole =
      (await prisma.userRole.findFirst({ where: { isDefault: true } })) ??
      (await prisma.userRole.findFirst({
        where: { isTrashed: false },
        orderBy: { createdAt: 'asc' },
      }));

    if (!defaultRole) {
      return NextResponse.json(
        { message: 'No roles configured. Seed the database first.' },
        { status: 500 },
      );
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        roleId: defaultRole.id,
        status: 'INACTIVE',
      },
    });

    const token = await createVerificationToken(email, 'VERIFY_EMAIL');

    await sendEmail({
      to: email,
      subject: `Verify your ${getAppName()} account`,
      content: {
        title: `Welcome, ${name}!`,
        subtitle:
          'Confirm your email address to activate your account. The link expires in 24 hours.',
        buttonLabel: 'Verify Email',
        buttonUrl: `${getAppUrl()}/verify-email?token=${token}`,
      },
    });

    await systemLog({
      event: 'SIGNUP',
      userId: user.id,
      entityType: 'User',
      entityId: user.id,
      description: 'New user signed up',
      ipAddress: getClientIP(request),
    });

    return NextResponse.json(
      {
        message:
          'Account created. Please check your email to verify your account.',
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[signup]', error);
    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 },
    );
  }
}
