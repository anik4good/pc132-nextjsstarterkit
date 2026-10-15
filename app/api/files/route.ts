import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import { badRequest, forbidden, requireSession, serverError, unauthorized } from '@/lib/api-helpers';
import { systemLog } from '@/services/system-log';
import {
  attachmentUrl,
  buildStorageKey,
  getStorage,
  putObject,
} from '@/services/storage';

export const runtime = 'nodejs';

const MAX_SIZE_MB = Number(process.env.UPLOAD_MAX_SIZE_MB || 10);

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'text/'];
const ALLOWED_MIME_EXACT = new Set([
  'application/pdf',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/octet-stream',
]);

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!form || !(file instanceof File)) {
      return badRequest('A file field is required.');
    }
    if (file.size === 0) return badRequest('The file is empty.');
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return badRequest(`File exceeds the ${MAX_SIZE_MB}MB limit.`);
    }
    const mimeType = file.type || 'application/octet-stream';
    if (
      !ALLOWED_MIME_EXACT.has(mimeType) &&
      !ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))
    ) {
      return badRequest(`File type ${mimeType} is not allowed.`);
    }

    const visibility = form.get('visibility') === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE';
    const directory = String(form.get('directory') || 'uploads').replace(/[^\w-]/g, '') || 'uploads';
    const userCompanyId = session.user.companyId ?? null;

    const storage = getStorage();
    const key = buildStorageKey(directory, file.name || 'file');
    await storage.put(Buffer.from(await file.arrayBuffer()), key, mimeType);

    const attachment = await prisma.attachment.create({
      data: {
        companyId: userCompanyId,
        uploaderId: session.user.id,
        filename: file.name || 'file',
        mimeType,
        size: file.size,
        storageDriver: storage.name,
        storageKey: key,
        visibility,
      },
    });

    await systemLog({
      event: 'FILE_UPLOADED',
      userId: session.user.id,
      companyId: userCompanyId,
      entityId: attachment.id,
      entityType: 'Attachment',
      description: `Uploaded ${attachment.filename} (${file.size} bytes)`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json(
      {
        message: 'File uploaded successfully.',
        data: { ...attachment, url: attachmentUrl(attachment) },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid storage key') {
      return forbidden('Invalid upload path.');
    }
    return serverError(error, 'files:upload');
  }
}
