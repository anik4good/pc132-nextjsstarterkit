'use client';

import { apiFetch } from '@/lib/api';

export interface UploadedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storageDriver: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  url: string;
}

/**
 * Upload a file to /api/files (session-scoped, tenant-tagged).
 * Returns the attachment record incl. a usable `url`
 * (API route for the local driver, CDN/object URL for s3).
 */
export async function uploadFile(
  file: File,
  options?: { directory?: string; visibility?: 'PRIVATE' | 'PUBLIC' },
): Promise<UploadedAttachment> {
  const form = new FormData();
  form.append('file', file);
  if (options?.directory) form.append('directory', options.directory);
  if (options?.visibility) form.append('visibility', options.visibility);

  const response = await apiFetch('/api/files', {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const { message } = await response.json().catch(() => ({
      message: 'Upload failed. Please try again.',
    }));
    throw new Error(message);
  }

  const result = await response.json();
  return result.data;
}
