import { db } from '@/lib/db';
import { appSettingsTable } from '@/lib/schema';
import { like } from 'drizzle-orm';
import pino from 'pino';

const logger = pino({ name: 'settings-cache' });

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

class SettingsCache {
  private cache = new Map<string, CacheEntry<Record<string, unknown>>>();
  private TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get settings for a job, using cache if available
   * @param jobName The name of the job (e.g., 'reply-to-tweets')
   * @returns Object with job settings
   */
  async get(jobName: string): Promise<Record<string, unknown>> {
    const cached = this.cache.get(jobName);

    // Return cached data if not expired
    if (cached && Date.now() < cached.expiry) {
      logger.debug({ jobName }, 'Using cached settings');
      return cached.data;
    }

    // Load from database
    logger.debug({ jobName }, 'Loading settings from database');
    const data = await this.loadSettings(jobName);

    // Store in cache
    this.cache.set(jobName, {
      data,
      expiry: Date.now() + this.TTL,
    });

    return data;
  }

  /**
   * Load settings from database
   */
  private async loadSettings(jobName: string): Promise<Record<string, unknown>> {
    const prefix = `${jobName}_`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settingsArray = await (db as any)
      .select()
      .from(appSettingsTable)
      .where(like(appSettingsTable.key, `${prefix}%`)) as Array<{
        id: number;
        key: string;
        value: string;
        updatedAt: Date | null
      }>;

    // Convert to object
    const settings = settingsArray.reduce((acc: Record<string, unknown>, setting: { key: string; value: string }) => {
      const settingKey = setting.key.replace(prefix, '');
      // Parse JSON values
      try {
        acc[settingKey] = JSON.parse(setting.value);
      } catch {
        acc[settingKey] = setting.value;
      }
      return acc;
    }, {} as Record<string, unknown>);

    return settings;
  }

  /**
   * Invalidate cache for a specific job
   * @param jobName The name of the job to invalidate
   */
  invalidate(jobName: string): void {
    logger.debug({ jobName }, 'Invalidating cache');
    this.cache.delete(jobName);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    logger.debug('Clearing entire cache');
    this.cache.clear();
  }

  /**
   * Get cache size (for monitoring)
   */
  getSize(): number {
    return this.cache.size;
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiry) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug({ cleanedCount }, 'Cleaned up expired cache entries');
    }
  }
}

// Export singleton instance
export const settingsCache = new SettingsCache();

// Run cleanup every 10 minutes
setInterval(() => {
  settingsCache.cleanup();
}, 10 * 60 * 1000);
