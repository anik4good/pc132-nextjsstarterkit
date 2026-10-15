import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import {
  forbidden,
  isSuperAdmin,
  notFound,
  requireSession,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';
import { getS3ClientInstance } from '@/lib/s3-client';
import { systemLog } from '@/services/system-log';
import { localPath } from '@/services/storage';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

function s3PublicUrl(storageKey: string): string | null {
  const cdn = process.env.STORAGE_CDN_URL?.replace(/\/$/, '');
  const endpoint = process.env.STORAGE_ENDPOINT?.replace(/\/$/, '');
  if (cdn) return `${cdn}/${storageKey}`;
  if (endpoint) return `${endpoint}/${storageKey}`;
  return null;
}

/**
 * Download/serve an attachment.
 * - PUBLIC attachments (e.g. avatars): open to everyone.
 * - PRIVATE: session required + same company (or uploader/superadmin).
 * - local driver: streamed from disk. s3: PUBLIC objects redirect to the
 *   CDN/object URL; PRIVATE objects are proxied through the app.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) return notFound('File not found.');

    if (attachment.visibility === 'PRIVATE') {
      const session = await requireSession();
      if (!session) return forbidden('Authentication required.');
      const allowed =
        isSuperAdmin(session) ||
        attachment.uploaderId === session.user.id ||
        (attachment.companyId !== null &&
          attachment.companyId === session.user.companyId);
      if (!allowed) return forbidden('You do not have access to this file.');
    }

    const headers: Record<string, string> = {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `inline; filename="${attachment.filename}"`,
      'Cache-Control':
        attachment.visibility === 'PUBLIC'
          ? 'public, max-age=31536000'
          : 'private, max-age=0',
    };

    if (attachment.storageDriver === 's3') {
      const publicUrl = s3PublicUrl(attachment.storageKey);
      if (attachment.visibility === 'PUBLIC' && publicUrl) {
        return NextResponse.redirect(publicUrl);
      }
      // Proxy PRIVATE s3 objects through the app.
      const result = await getS3ClientInstance().send(
        new GetObjectCommand({
          Bucket: process.env.STORAGE_BUCKET || '',
          Key: attachment.storageKey,
        }),
      );
      if (!result.Body) return notFound('File not found.');
      return new NextResponse(
        Readable.toWeb(result.Body as Readable) as ReadableStream,
        { headers },
      );
    }

    // local driver — stream from disk
    const filePath = localPath(attachment.storageKey);
    try {
      await fs.access(filePath);
    } catch {
      return notFound('File not found.');
    }

    const stream = Readable.toWeb(
      createReadStream(filePath),
    ) as ReadableStream;
    headers['Content-Length'] = String(attachment.size);

    return new NextResponse(stream, { headers });
  } catch (error) {
    return serverError(error, 'files:download');
  }
}

/** Delete an attachment — uploader or superadmin only. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const { id } = await context.params;

    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) return notFound('File not found.');

    const allowed =
      isSuperAdmin(session) || attachment.uploaderId === session.user.id;
    if (!allowed) {
      return forbidden(
        'Only the uploader or a super admin can delete this file.',
      );
    }

    if (attachment.storageDriver === 's3') {
      await getS3ClientInstance().send(
        new DeleteObjectCommand({
          Bucket: process.env.STORAGE_BUCKET || '',
          Key: attachment.storageKey,
        }),
      );
    } else {
      try {
        await unlink(localPath(attachment.storageKey));
      } catch {
        // already gone — deletion is idempotent
      }
    }

    await prisma.attachment.delete({ where: { id } });

    await systemLog({
      event: 'FILE_DELETED',
      userId: session.user.id,
      companyId: attachment.companyId,
      entityId: attachment.id,
      entityType: 'Attachment',
      description: `Deleted ${attachment.filename}`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ message: 'File deleted successfully.' });
  } catch (error) {
    return serverError(error, 'files:delete');
  }
}
