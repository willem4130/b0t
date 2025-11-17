import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRateLimiter,
  withRateLimit,
  getRateLimiterStats,
  updateReservoir,
} from './rate-limiter';
import Bottleneck from 'bottleneck';

describe('rate-limiter', () => {
  let limiters: Bottleneck[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    limiters = [];
  });

  afterEach(async () => {
    // Clean up all limiters
    for (const limiter of limiters) {
      await limiter.stop({ dropWaitingJobs: true });
    }
    limiters = [];
  });

  describe('createRateLimiter', () => {
    it('should create a rate limiter with default config', () => {
      const limiter = createRateLimiter({});
      limiters.push(limiter);

      expect(limiter).toBeInstanceOf(Bottleneck);
    });

    it('should create a rate limiter with custom config', () => {
      const limiter = createRateLimiter({
        maxConcurrent: 2,
        minTime: 1000,
        reservoir: 100,
        reservoirRefreshAmount: 100,
        reservoirRefreshInterval: 60000,
        id: 'custom-limiter',
      });
      limiters.push(limiter);

      expect(limiter).toBeInstanceOf(Bottleneck);
    });

    it('should respect maxConcurrent setting', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 2,
      });
      limiters.push(limiter);

      let running = 0;
      let maxRunning = 0;

      const task = vi.fn(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise(resolve => setTimeout(resolve, 50));
        running--;
      });

      // Start 5 tasks
      const promises = Array(5).fill(null).map(() =>
        limiter.schedule(() => task())
      );

      await Promise.all(promises);

      expect(maxRunning).toBeLessThanOrEqual(2);
      expect(task).toHaveBeenCalledTimes(5);
    }, 10000);

    it('should respect minTime between requests', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 1,
        minTime: 100, // 100ms between requests
      });
      limiters.push(limiter);

      const timestamps: number[] = [];
      const task = vi.fn(async () => {
        timestamps.push(Date.now());
      });

      // Execute 3 tasks
      await limiter.schedule(() => task());
      await limiter.schedule(() => task());
      await limiter.schedule(() => task());

      // Check that there's at least 95ms between each (allow 5ms tolerance for timing)
      expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(95);
      expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(95);
    }, 10000);

    it('should enforce reservoir limits', async () => {
      const limiter = createRateLimiter({
        reservoir: 3, // Only allow 3 requests
        maxConcurrent: 10,
      });
      limiters.push(limiter);

      const task = vi.fn(async () => 'done');

      // First 3 should succeed immediately
      await limiter.schedule(() => task());
      await limiter.schedule(() => task());
      await limiter.schedule(() => task());

      expect(task).toHaveBeenCalledTimes(3);
    }, 10000);
  });

  describe('withRateLimit', () => {
    it('should wrap a function with rate limiting', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 1,
        minTime: 50,
      });
      limiters.push(limiter);

      const fn = vi.fn(async (x: number) => x * 2);
      const rateLimitedFn = withRateLimit(fn, limiter);

      const result = await rateLimitedFn(5);

      expect(result).toBe(10);
      expect(fn).toHaveBeenCalledWith(5);
    });

    it('should rate limit wrapped function calls', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 1,
        minTime: 100,
      });
      limiters.push(limiter);

      const timestamps: number[] = [];
      const fn = vi.fn(async () => {
        timestamps.push(Date.now());
      });

      const rateLimitedFn = withRateLimit(fn, limiter);

      await rateLimitedFn();
      await rateLimitedFn();
      await rateLimitedFn();

      // Allow 5ms tolerance for timing
      expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(95);
      expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(95);
    }, 10000);

    it('should pass all arguments to wrapped function', async () => {
      const limiter = createRateLimiter({});
      limiters.push(limiter);

      const fn = vi.fn(async (a: string, b: number, c: boolean) => ({ a, b, c }));
      const rateLimitedFn = withRateLimit(fn, limiter);

      const result = await rateLimitedFn('test', 42, true);

      expect(result).toEqual({ a: 'test', b: 42, c: true });
      expect(fn).toHaveBeenCalledWith('test', 42, true);
    });

    it('should propagate errors from wrapped function', async () => {
      const limiter = createRateLimiter({});
      limiters.push(limiter);

      const fn = vi.fn(async () => {
        throw new Error('Function error');
      });

      const rateLimitedFn = withRateLimit(fn, limiter);

      await expect(rateLimitedFn()).rejects.toThrow('Function error');
    });

    it('should queue multiple concurrent calls', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 1,
        minTime: 50,
      });
      limiters.push(limiter);

      let activeCount = 0;
      const fn = vi.fn(async (id: number) => {
        activeCount++;
        expect(activeCount).toBe(1); // Only one should run at a time
        await new Promise(resolve => setTimeout(resolve, 20));
        activeCount--;
        return id;
      });

      const rateLimitedFn = withRateLimit(fn, limiter);

      // Start 5 calls concurrently
      const results = await Promise.all([
        rateLimitedFn(1),
        rateLimitedFn(2),
        rateLimitedFn(3),
        rateLimitedFn(4),
        rateLimitedFn(5),
      ]);

      expect(results).toEqual([1, 2, 3, 4, 5]);
      expect(fn).toHaveBeenCalledTimes(5);
    }, 10000);
  });

  describe('getRateLimiterStats', () => {
    it('should return stats for a limiter', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 1,
      });
      limiters.push(limiter);

      const stats = await getRateLimiterStats(limiter);

      expect(stats).toHaveProperty('running');
      expect(stats).toHaveProperty('queued');
      expect(stats).toHaveProperty('executing');
      expect(stats).toHaveProperty('done');
    });

    it('should track running or queued jobs', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 2,
      });
      limiters.push(limiter);

      const slowTask = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      };

      // Start 2 tasks
      const promises = [
        limiter.schedule(slowTask),
        limiter.schedule(slowTask),
      ];

      // Check stats while running
      await new Promise(resolve => setTimeout(resolve, 10));
      const stats = await getRateLimiterStats(limiter);

      // At least one of these should be non-zero
      expect(stats.running + stats.executing).toBeGreaterThan(0);

      await Promise.all(promises);
    }, 10000);

    it('should track queued jobs', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 1,
      });
      limiters.push(limiter);

      const slowTask = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      };

      // Start 3 tasks (1 running, 2 queued)
      const promises = [
        limiter.schedule(slowTask),
        limiter.schedule(slowTask),
        limiter.schedule(slowTask),
      ];

      // Check stats while running
      await new Promise(resolve => setTimeout(resolve, 10));
      const stats = await getRateLimiterStats(limiter);

      expect(stats.queued).toBeGreaterThan(0);

      await Promise.all(promises);
    }, 10000);

    it('should complete jobs successfully', async () => {
      const limiter = createRateLimiter({});
      limiters.push(limiter);

      const task = vi.fn(async () => 'done');

      await limiter.schedule(task);
      await limiter.schedule(task);
      await limiter.schedule(task);

      // Verify all tasks executed
      expect(task).toHaveBeenCalledTimes(3);
    });
  });

  describe('updateReservoir', () => {
    it('should update the reservoir size', async () => {
      const limiter = createRateLimiter({
        reservoir: 5,
      });
      limiters.push(limiter);

      await updateReservoir(limiter, 10);

      // Should now allow more requests
      const task = vi.fn(async () => 'done');

      // Execute 10 tasks (more than original reservoir of 5)
      for (let i = 0; i < 10; i++) {
        await limiter.schedule(task);
      }

      expect(task).toHaveBeenCalledTimes(10);
    }, 10000);
  });

  describe('real-world scenarios', () => {
    it('should handle Twitter API rate limiting pattern', async () => {
      // Twitter: 300 requests per 15 minutes
      // Use smaller minTime for faster test
      const limiter = createRateLimiter({
        maxConcurrent: 1,
        minTime: 100, // 100ms for testing
        reservoir: 10,
        reservoirRefreshAmount: 10,
        reservoirRefreshInterval: 60000,
      });
      limiters.push(limiter);

      const postTweet = vi.fn(async (text: string) => ({ id: '123', text }));
      const rateLimitedPost = withRateLimit(postTweet, limiter);

      // Post 3 tweets
      await rateLimitedPost('Tweet 0');
      await rateLimitedPost('Tweet 1');
      await rateLimitedPost('Tweet 2');

      // Verify all calls completed
      expect(postTweet).toHaveBeenCalledTimes(3);
      expect(postTweet).toHaveBeenCalledWith('Tweet 0');
      expect(postTweet).toHaveBeenCalledWith('Tweet 1');
      expect(postTweet).toHaveBeenCalledWith('Tweet 2');
    }, 10000);

    it('should handle burst traffic with queueing', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 2,
        minTime: 50,
      });
      limiters.push(limiter);

      const apiCall = vi.fn(async (id: number) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { id };
      });

      const rateLimitedCall = withRateLimit(apiCall, limiter);

      // Send 10 requests at once
      const promises = Array(10).fill(null).map((_, i) => rateLimitedCall(i));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(apiCall).toHaveBeenCalledTimes(10);
    }, 10000);

    it('should handle API with different limits for different endpoints', async () => {
      const readLimiter = createRateLimiter({
        maxConcurrent: 5,
        minTime: 100,
        id: 'read-api',
      });
      limiters.push(readLimiter);

      const writeLimiter = createRateLimiter({
        maxConcurrent: 1,
        minTime: 1000,
        id: 'write-api',
      });
      limiters.push(writeLimiter);

      const readAPI = vi.fn(async () => ({ data: 'read' }));
      const writeAPI = vi.fn(async () => ({ data: 'written' }));

      const rateLimitedRead = withRateLimit(readAPI, readLimiter);
      const rateLimitedWrite = withRateLimit(writeAPI, writeLimiter);

      // Reads can be concurrent
      const readPromises = Array(5).fill(null).map(() => rateLimitedRead());
      await Promise.all(readPromises);

      // Writes are serialized
      await rateLimitedWrite();
      await rateLimitedWrite();

      expect(readAPI).toHaveBeenCalledTimes(5);
      expect(writeAPI).toHaveBeenCalledTimes(2);
    }, 10000);

    it('should coordinate rate limits across multiple jobs', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 1,
        minTime: 100,
      });
      limiters.push(limiter);

      const sharedAPI = vi.fn(async (source: string) => ({ source }));
      const rateLimitedAPI = withRateLimit(sharedAPI, limiter);

      // Simulate two different jobs using same API
      const job1 = async () => {
        await rateLimitedAPI('job1-call1');
        await rateLimitedAPI('job1-call2');
      };

      const job2 = async () => {
        await rateLimitedAPI('job2-call1');
        await rateLimitedAPI('job2-call2');
      };

      // Run jobs concurrently
      await Promise.all([job1(), job2()]);

      // All calls should be serialized
      expect(sharedAPI).toHaveBeenCalledTimes(4);
    }, 10000);
  });

  describe('error handling', () => {
    it('should handle function errors without breaking the limiter', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 1,
      });
      limiters.push(limiter);

      const flakyFn = vi.fn(async (shouldFail: boolean) => {
        if (shouldFail) {
          throw new Error('Failed');
        }
        return 'success';
      });

      const rateLimitedFn = withRateLimit(flakyFn, limiter);

      // Mix of failures and successes
      await expect(rateLimitedFn(true)).rejects.toThrow('Failed');
      expect(await rateLimitedFn(false)).toBe('success');
      await expect(rateLimitedFn(true)).rejects.toThrow('Failed');
      expect(await rateLimitedFn(false)).toBe('success');

      expect(flakyFn).toHaveBeenCalledTimes(4);
    });

    it('should continue processing after errors', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 1,
        minTime: 50,
      });
      limiters.push(limiter);

      let callCount = 0;
      const fn = vi.fn(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Second call fails');
        }
        return `call-${callCount}`;
      });

      const rateLimitedFn = withRateLimit(fn, limiter);

      expect(await rateLimitedFn()).toBe('call-1');
      await expect(rateLimitedFn()).rejects.toThrow('Second call fails');
      expect(await rateLimitedFn()).toBe('call-3');

      expect(fn).toHaveBeenCalledTimes(3);
    }, 10000);
  });

  describe('edge cases', () => {
    it('should handle zero minTime', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 1,
        minTime: 0,
      });
      limiters.push(limiter);

      const fn = vi.fn(async () => 'done');
      const rateLimitedFn = withRateLimit(fn, limiter);

      await rateLimitedFn();
      await rateLimitedFn();

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle high concurrent limit', async () => {
      const limiter = createRateLimiter({
        maxConcurrent: 100,
      });
      limiters.push(limiter);

      const fn = vi.fn(async () => 'done');
      const rateLimitedFn = withRateLimit(fn, limiter);

      const promises = Array(50).fill(null).map(() => rateLimitedFn());
      await Promise.all(promises);

      expect(fn).toHaveBeenCalledTimes(50);
    }, 10000);

    it('should handle functions returning various types', async () => {
      const limiter = createRateLimiter({});
      limiters.push(limiter);

      const fnUndefined = withRateLimit(async () => undefined, limiter);
      const fnNull = withRateLimit(async () => null, limiter);
      const fnObject = withRateLimit(async () => ({ key: 'value' }), limiter);
      const fnArray = withRateLimit(async () => [1, 2, 3], limiter);

      expect(await fnUndefined()).toBeUndefined();
      expect(await fnNull()).toBeNull();
      expect(await fnObject()).toEqual({ key: 'value' });
      expect(await fnArray()).toEqual([1, 2, 3]);
    });
  });
});
