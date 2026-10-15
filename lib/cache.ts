import type Redis from 'ioredis';

/**
 * Cache layer with pluggable drivers.
 *
 * - REDIS_URL set  → Redis (shared across instances — required for multi-instance prod)
 * - otherwise      → in-memory (per-instance; fine for dev/single-instance)
 *
 * This is the seam a dedicated cache/queue service would replace if this
 * module ever grows into its own microservice.
 */

interface CacheDriver {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Increment a fixed-window counter; returns the new count. */
  incrWindow(key: string, windowSeconds: number): Promise<number>;
}

// ---- In-memory driver ------------------------------------------------------

const memoryStore = new Map<string, { value: string; expiresAt: number | null }>();

function sweepMemory() {
  const now = Date.now();
  memoryStore.forEach((entry, key) => {
    if (entry.expiresAt !== null && entry.expiresAt <= now) memoryStore.delete(key);
  });
}

const memoryDriver: CacheDriver = {
  async get(key) {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  },
  async set(key, value, ttlSeconds) {
    if (memoryStore.size > 5000) sweepMemory();
    memoryStore.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  },
  async del(key) {
    memoryStore.delete(key);
  },
  async incrWindow(key, windowSeconds) {
    const existing = await memoryDriver.get(key);
    if (existing === null) {
      await memoryDriver.set(key, '1', windowSeconds);
      return 1;
    }
    const next = parseInt(existing, 10) + 1;
    // Preserve the original window expiry.
    const entry = memoryStore.get(key);
    memoryStore.set(key, {
      value: String(next),
      expiresAt: entry?.expiresAt ?? Date.now() + windowSeconds * 1000,
    });
    return next;
  },
};

// ---- Redis driver ----------------------------------------------------------

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!redisClient) {
    // Lazy require so dev machines without ioredis usage patterns stay light.
    const { default: RedisCtor } = require('ioredis') as {
      default: new (url: string, opts?: object) => Redis;
    };
    redisClient = new RedisCtor(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    redisClient.on('error', (err: Error) => {
      console.error('[cache] Redis error:', err.message);
    });
  }
  return redisClient;
}

const redisDriver: CacheDriver = {
  async get(key) {
    const redis = getRedis();
    if (!redis) return memoryDriver.get(key);
    return redis.get(key);
  },
  async set(key, value, ttlSeconds) {
    const redis = getRedis();
    if (!redis) return memoryDriver.set(key, value, ttlSeconds);
    if (ttlSeconds) await redis.set(key, value, 'EX', ttlSeconds);
    else await redis.set(key, value);
  },
  async del(key) {
    const redis = getRedis();
    if (!redis) return memoryDriver.del(key);
    await redis.del(key);
  },
  async incrWindow(key, windowSeconds) {
    const redis = getRedis();
    if (!redis) return memoryDriver.incrWindow(key, windowSeconds);
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return count;
  },
};

// ---- Public API ------------------------------------------------------------

export function getCache(): CacheDriver {
  return process.env.REDIS_URL ? redisDriver : memoryDriver;
}

/** Cache a value produced by `fn` for ttlSeconds. On cache/inner errors, returns undefined. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  try {
    const hit = await getCache().get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch {
    // fall through to fn on cache read errors
  }
  const value = await fn();
  try {
    await getCache().set(key, JSON.stringify(value), ttlSeconds);
  } catch {
    // non-fatal
  }
  return value;
}

export async function invalidate(key: string): Promise<void> {
  await getCache().del(key);
}
