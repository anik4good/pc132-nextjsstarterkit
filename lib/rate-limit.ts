import { getClientIP } from '@/lib/api';
import { getCache } from '@/lib/cache';

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limiter backed by the cache layer (Redis in multi-instance
 * prod, in-memory in dev). Attachments to auth surfaces: login, signup, reset.
 */
export async function checkRateLimit(
  identifier: string,
  action: string,
  limit = 10,
  windowSeconds = 300,
): Promise<RateLimitResult> {
  const key = `ratelimit:${action}:${identifier}`;
  let count = limit + 1;
  try {
    count = await getCache().incrWindow(key, windowSeconds);
  } catch (error) {
    // Never lock users out because the cache is down.
    console.error('[rate-limit] check failed, allowing request:', error);
    return { ok: true, remaining: limit, retryAfterSeconds: 0 };
  }

  if (count > limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: windowSeconds };
  }
  return { ok: true, remaining: limit - count, retryAfterSeconds: 0 };
}

/** Convenience: rate limit by the caller's IP for a named action. */
export async function checkIpRateLimit(
  request: Request,
  action: string,
  limit = 10,
  windowSeconds = 300,
): Promise<RateLimitResult> {
  return checkRateLimit(getClientIP(request as never), action, limit, windowSeconds);
}
