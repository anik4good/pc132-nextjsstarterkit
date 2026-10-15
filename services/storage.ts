import { promises as fs } from 'fs';
import path from 'path';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { uid } from '@/lib/helpers';
import { getS3ClientInstance } from '@/lib/s3-client';

/**
 * Storage abstraction — the seam a dedicated media/worker service would take
 * over if file processing ever outgrows the app.
 *
 * Drivers (selected by STORAGE_DRIVER env, default `local`):
 * - local: files under UPLOAD_DIR (default `.data/uploads`), served through
 *   /api/files/[id] so PRIVATE objects stay behind auth. Zero-config dev.
 * - s3: any S3-compatible object store (AWS S3, DO Spaces, MinIO, R2…).
 *   Objects are stored public-read so PUBLIC attachments get a direct CDN URL.
 */

export interface StorageDriver {
  name: string;
  put(buffer: Buffer, key: string, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Direct public URL, or null when downloads must go through /api/files/[id]. */
  publicUrl(key: string): string | null;
}

// ---- local driver ----------------------------------------------------------

function uploadsDir(): string {
  return path.join(process.cwd(), process.env.UPLOAD_DIR || '.data/uploads');
}

/** Absolute local path for a storage key (also used by the download route). */
export function localPath(key: string): string {
  return safeLocalPath(key);
}

function safeLocalPath(key: string): string {
  const resolved = path.resolve(uploadsDir(), key);
  if (!resolved.startsWith(path.resolve(uploadsDir()))) {
    throw new Error('Invalid storage key');
  }
  return resolved;
}

const localDriver: StorageDriver = {
  name: 'local',
  async put(buffer, key, _contentType) {
    const target = safeLocalPath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
  },
  async delete(key) {
    try {
      await fs.unlink(safeLocalPath(key));
    } catch {
      // already gone — deletion is idempotent
    }
  },
  publicUrl() {
    return null; // always served through /api/files/[id]
  },
};

// ---- s3 driver -------------------------------------------------------------

function s3Config() {
  return {
    bucket: process.env.STORAGE_BUCKET || '',
    cdnUrl: process.env.STORAGE_CDN_URL?.replace(/\/$/, ''),
    endpoint: process.env.STORAGE_ENDPOINT?.replace(/\/$/, ''),
  };
}

const s3Driver: StorageDriver = {
  name: 's3',
  async put(buffer, key, contentType) {
    const { bucket } = s3Config();
    await getS3ClientInstance().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000',
        ACL: 'public-read',
      }),
    );
  },
  async delete(key) {
    const { bucket } = s3Config();
    await getS3ClientInstance().send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  },
  publicUrl(key) {
    const { cdnUrl, endpoint } = s3Config();
    if (cdnUrl) return `${cdnUrl}/${key}`;
    if (endpoint) return `${endpoint}/${key}`;
    return null;
  },
};

// ---- public API ------------------------------------------------------------

export function getStorage(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER || 'local';
  if (driver === 's3') return s3Driver;
  return localDriver;
}

/** Build a collision-safe storage key: avatars/ab12cd_photo.jpg */
export function buildStorageKey(directory: string, filename: string): string {
  const safe = filename.replace(/[^\w.-]+/g, '_').slice(-120);
  return `${directory.replace(/^\/+|\/+$/g, '')}/${uid()}_${safe}`;
}

export async function putObject(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<void> {
  await getStorage().put(buffer, key, contentType);
}

export async function deleteObject(key: string): Promise<void> {
  await getStorage().delete(key);
}

/** URL usable in <img>/<a>: direct for public-capable drivers, API route otherwise. */
export function attachmentUrl(attachment: {
  id: string;
  storageDriver: string;
  storageKey: string;
}): string {
  if (attachment.storageDriver === 's3') {
    const url = getStorage().publicUrl(attachment.storageKey);
    if (url) return url;
  }
  return `/api/files/${attachment.id}`;
}
