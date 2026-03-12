import NodeCache from 'node-cache';

// In-memory cache — default TTL 10 minutes
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

export const cacheGet = <T>(key: string): T | null => {
  const value = cache.get<T>(key);
  return value !== undefined ? value : null;
};

export const cacheSet = <T>(key: string, value: T, ttl = 600): void => {
  cache.set(key, value, ttl);
};

export const cacheDel = (key: string): void => {
  cache.del(key);
};

export const cacheFlush = (): void => {
  cache.flushAll();
};

export { cache };
