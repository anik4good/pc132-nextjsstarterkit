import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/services/send-email';

export type NotificationChannel = 'in-app' | 'email';

export interface NotifyProps {
  /** Recipient user ids (required unless companyRole is used). */
  recipients?: string[];
  /** Send to every company admin of this company. */
  companyAdminsOf?: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
  companyId?: string | null;
  channels?: NotificationChannel[];
}

/**
 * Notification dispatcher — the seam a realtime/SMS fan-out service would
 * replace. Channels:
 * - in-app: writes a Notification row (bell + notifications page)
 * - email: reuses the transactional email service
 */
export async function notify({
  recipients,
  companyAdminsOf,
  type,
  title,
  body,
  link,
  data,
  companyId = null,
  channels = ['in-app'],
}: NotifyProps): Promise<{ notified: number }> {
  const userIds = new Set(recipients ?? []);

  if (companyAdminsOf) {
    const admins = await prisma.user.findMany({
      where: {
        companyId: companyAdminsOf,
        isTrashed: false,
        role: { isCompanyAdmin: true },
      },
      select: { id: true, email: true },
    });
    admins.forEach((admin) => userIds.add(admin.id));
  }

  if (userIds.size === 0) return { notified: 0 };

  const ids = Array.from(userIds);

  if (channels.includes('in-app')) {
    await prisma.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        companyId,
        type,
        title,
        body: body ?? null,
        link: link ?? null,
        data: (data ?? undefined) as never,
      })),
    });
  }

  if (channels.includes('email')) {
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { email: true },
    });
    await Promise.all(
      users.map((user) =>
        sendEmail({
          to: user.email,
          subject: title,
          content: {
            title,
            subtitle: body,
            buttonLabel: link ? 'View details' : undefined,
            buttonUrl: link,
          },
        }),
      ),
    );
  }

  return { notified: ids.length };
}
