import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';
import { systemLog } from '@/services/system-log';

/** NextAuth surfaces provider errors as JSON strings — the sign-in form parses them. */
function authError(message: string): Error {
  return new Error(JSON.stringify({ message }));
}

function requestIp(req: unknown): string {
  const headers = (req as { headers?: { get?: (k: string) => string | null } })
    ?.headers;
  return (
    headers?.get?.('x-forwarded-for') ||
    headers?.get?.('x-real-ip') ||
    'unknown'
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
  pages: {
    signIn: '/signin',
    error: '/signin',
  },
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password || '';

        if (!email || !password) {
          throw authError('Email and password are required.');
        }

        // Brute-force protection: 10 sign-in attempts per IP per 5 minutes.
        const rate = await checkRateLimit(requestIp(req), 'login', 10, 300);
        if (!rate.ok) {
          throw authError(
            'Too many sign-in attempts. Please try again in a few minutes.',
          );
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { role: true, company: true },
        });

        if (!user || !user.password) {
          throw authError('Invalid email or password.');
        }
        if (user.isTrashed) {
          throw authError('This account has been deleted.');
        }
        if (user.status === 'BLOCKED') {
          throw authError(
            'Your account has been blocked. Please contact support.',
          );
        }
        if (!user.emailVerifiedAt) {
          throw authError(
            'Please verify your email address before signing in. Check your inbox for the verification link.',
          );
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
          throw authError('Invalid email or password.');
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastSignInAt: new Date() },
        });

        await systemLog({
          event: 'SIGNIN',
          userId: user.id,
          companyId: user.companyId,
          entityType: 'User',
          entityId: user.id,
          description: 'User signed in with email and password',
          ipAddress: requestIp(req),
        });

        return {
          id: user.id,
          name: user.name ?? '',
          email: user.email,
          avatar: user.avatar ?? null,
          roleId: user.roleId,
          roleName: user.role?.name ?? null,
          roleSlug: user.role?.slug ?? null,
          isSuperAdmin: user.role?.isSuperAdmin ?? false,
          isCompanyAdmin: user.role?.isCompanyAdmin ?? false,
          companyId: user.companyId ?? null,
          companyName: user.company?.name ?? null,
          status: user.status,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name ?? '';
        token.email = user.email ?? '';
        token.avatar = user.avatar ?? null;
        token.roleId = user.roleId ?? null;
        token.roleName = user.roleName ?? null;
        token.roleSlug = user.roleSlug ?? null;
        token.isSuperAdmin = user.isSuperAdmin ?? false;
        token.isCompanyAdmin = user.isCompanyAdmin ?? false;
        token.companyId = user.companyId ?? null;
        token.companyName = user.companyName ?? null;
        token.status = user.status ?? 'INACTIVE';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string;
        session.user.email = token.email as string;
        session.user.avatar = (token.avatar as string | null) ?? null;
        session.user.roleId = (token.roleId as string | null) ?? null;
        session.user.roleName = (token.roleName as string | null) ?? null;
        session.user.roleSlug = (token.roleSlug as string | null) ?? null;
        session.user.isSuperAdmin = (token.isSuperAdmin as boolean) ?? false;
        session.user.isCompanyAdmin = (token.isCompanyAdmin as boolean) ?? false;
        session.user.companyId = (token.companyId as string | null) ?? null;
        session.user.companyName = (token.companyName as string | null) ?? null;
        session.user.status = token.status as string;
        session.user.impersonatedBy = (token.impersonatedBy as string | null) ?? null;
      }
      return session;
    },
  },
};
