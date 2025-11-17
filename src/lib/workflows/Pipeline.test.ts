import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pipeline, createPipeline } from './Pipeline';

describe('Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('step', () => {
    it('should add a step to the pipeline', () => {
      const pipeline = createPipeline<{ count: number }>();
      const stepFn = vi.fn(async (ctx) => ({ ...ctx, count: ctx.count + 1 }));

      pipeline.step('increment', stepFn);

      expect(pipeline).toBeInstanceOf(Pipeline);
    });

    it('should chain multiple steps', () => {
      const pipeline = createPipeline<{ count: number }>()
        .step('step1', async (ctx) => ({ ...ctx, count: ctx.count + 1 }))
        .step('step2', async (ctx) => ({ ...ctx, count: ctx.count * 2 }))
        .step('step3', async (ctx) => ({ ...ctx, count: ctx.count - 1 }));

      expect(pipeline).toBeInstanceOf(Pipeline);
    });

    it('should support type transformation between steps', () => {
      const pipeline = createPipeline<{ value: number }>()
        .step('toString', async (ctx) => ({ str: ctx.value.toString() }))
        .step('uppercase', async (ctx) => ({ result: ctx.str.toUpperCase() }));

      expect(pipeline).toBeInstanceOf(Pipeline);
    });
  });

  describe('execute', () => {
    it('should execute all steps in sequence', async () => {
      const step1 = vi.fn(async (ctx: { count: number }) => ({ ...ctx, count: ctx.count + 1 }));
      const step2 = vi.fn(async (ctx: { count: number }) => ({ ...ctx, count: ctx.count * 2 }));
      const step3 = vi.fn(async (ctx: { count: number }) => ({ ...ctx, count: ctx.count - 3 }));

      const pipeline = createPipeline<{ count: number }>()
        .step('step1', step1)
        .step('step2', step2)
        .step('step3', step3);

      const result = await pipeline.execute({ count: 5 });

      expect(step1).toHaveBeenCalledWith({ count: 5 });
      expect(step2).toHaveBeenCalledWith({ count: 6 });
      expect(step3).toHaveBeenCalledWith({ count: 12 });
      expect(result.success).toBe(true);
      expect(result.finalData).toEqual({ count: 9 });
    });

    it('should pass data between steps correctly', async () => {
      const pipeline = createPipeline<{ value: number }>()
        .step('double', async (ctx) => ({ ...ctx, value: ctx.value * 2 }))
        .step('addTen', async (ctx) => ({ ...ctx, value: ctx.value + 10 }))
        .step('square', async (ctx) => ({ ...ctx, value: ctx.value ** 2 }));

      const result = await pipeline.execute({ value: 3 });

      // (3 * 2) + 10 = 16, then 16^2 = 256
      expect(result.success).toBe(true);
      expect(result.finalData).toEqual({ value: 256 });
    });

    it('should record step results with timing', async () => {
      const pipeline = createPipeline<{ count: number }>()
        .step('step1', async (ctx) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { ...ctx, count: ctx.count + 1 };
        })
        .step('step2', async (ctx) => {
          await new Promise(resolve => setTimeout(resolve, 20));
          return { ...ctx, count: ctx.count + 1 };
        });

      const result = await pipeline.execute({ count: 0 });

      expect(result.results).toHaveLength(2);
      expect(result.results[0].name).toBe('step1');
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].duration).toBeGreaterThanOrEqual(10);
      expect(result.results[1].name).toBe('step2');
      expect(result.results[1].success).toBe(true);
      expect(result.results[1].duration).toBeGreaterThanOrEqual(20);
    });

    it('should stop on first error by default', async () => {
      const step1 = vi.fn(async (ctx: { count: number }) => ({ ...ctx, count: ctx.count + 1 }));
      const step2 = vi.fn(async () => {
        throw new Error('Step 2 failed');
      });
      const step3 = vi.fn(async (ctx: { count: number }) => ({ ...ctx, count: ctx.count + 1 }));

      const pipeline = createPipeline<{ count: number }>()
        .step('step1', step1)
        .step('step2', step2)
        .step('step3', step3);

      const result = await pipeline.execute({ count: 0 });

      expect(step1).toHaveBeenCalled();
      expect(step2).toHaveBeenCalled();
      expect(step3).not.toHaveBeenCalled(); // Should not execute
      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('Step 2 failed');
    });

    it('should continue on error when continueOnError is true', async () => {
      const step1 = vi.fn(async (ctx: { count: number }) => ({ ...ctx, count: ctx.count + 1 }));
      const step2 = vi.fn(async () => {
        throw new Error('Step 2 failed');
      });
      const step3 = vi.fn(async (ctx: { count: number }) => ({ ...ctx, count: ctx.count + 1 }));

      const pipeline = createPipeline<{ count: number }>()
        .step('step1', step1)
        .step('step2', step2)
        .step('step3', step3);

      const result = await pipeline.execute({ count: 0 }, { continueOnError: true });

      expect(step1).toHaveBeenCalled();
      expect(step2).toHaveBeenCalled();
      expect(step3).toHaveBeenCalled(); // Should execute despite step2 error
      expect(result.success).toBe(false); // Overall result is false
      expect(result.results).toHaveLength(3);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[2].success).toBe(true);
    });

    it('should handle empty pipeline', async () => {
      const pipeline = createPipeline<{ value: number }>();
      const result = await pipeline.execute({ value: 42 });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
      expect(result.finalData).toEqual({ value: 42 });
    });

    it('should handle complex data transformations', async () => {
      interface UserData {
        name: string;
        age: number;
      }

      const pipeline = createPipeline<UserData>()
        .step('addEmail', async (ctx) => ({
          ...ctx,
          email: `${ctx.name.toLowerCase()}@example.com`,
        }))
        .step('checkAge', async (ctx) => ({
          ...ctx,
          isAdult: ctx.age >= 18,
        }));

      const result = await pipeline.execute({ name: 'Alice', age: 25 });

      expect(result.success).toBe(true);
      expect(result.finalData).toEqual({
        name: 'Alice',
        age: 25,
        email: 'alice@example.com',
        isAdult: true,
      });
    });

    it('should capture error messages correctly', async () => {
      const pipeline = createPipeline<{ value: number }>()
        .step('throwError', async (): Promise<{ value: number }> => {
          throw new Error('Custom error message');
        });

      const result = await pipeline.execute({ value: 1 });

      expect(result.success).toBe(false);
      expect(result.results[0].error).toBe('Custom error message');
    });

    it('should handle non-Error throws', async () => {
      const pipeline = createPipeline<{ value: number }>()
        .step('throwString', async (): Promise<{ value: number }> => {
          throw 'String error';
        });

      const result = await pipeline.execute({ value: 1 });

      expect(result.success).toBe(false);
      expect(result.results[0].error).toBe('String error');
    });

    it('should return all successful when all steps pass', async () => {
      const pipeline = createPipeline<{ count: number }>()
        .step('step1', async (ctx) => ({ ...ctx, count: ctx.count + 1 }))
        .step('step2', async (ctx) => ({ ...ctx, count: ctx.count + 1 }))
        .step('step3', async (ctx) => ({ ...ctx, count: ctx.count + 1 }));

      const result = await pipeline.execute({ count: 0 });

      expect(result.success).toBe(true);
      expect(result.results.every(r => r.success)).toBe(true);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle tweet reply workflow pattern', async () => {
      interface TweetWorkflow {
        query?: string;
        tweets?: Array<{ id: string; text: string }>;
        rankedTweets?: Array<{ id: string; score: number }>;
        selectedTweet?: { id: string; text: string };
        reply?: string;
        posted?: boolean;
      }

      const pipeline = createPipeline<TweetWorkflow>()
        .step('searchTweets', async (ctx) => ({
          ...ctx,
          tweets: [
            { id: '1', text: 'Hello world' },
            { id: '2', text: 'Test tweet' },
          ],
        }))
        .step('rankTweets', async (ctx) => ({
          ...ctx,
          rankedTweets: ctx.tweets!.map((t, i) => ({ id: t.id, score: i })),
        }))
        .step('selectBest', async (ctx) => ({
          ...ctx,
          selectedTweet: ctx.tweets!.find(t => t.id === ctx.rankedTweets![0].id),
        }))
        .step('generateReply', async (ctx) => ({
          ...ctx,
          reply: `Reply to: ${ctx.selectedTweet!.text}`,
        }))
        .step('postReply', async (ctx) => ({
          ...ctx,
          posted: true,
        }));

      const result = await pipeline.execute({ query: 'test' });

      expect(result.success).toBe(true);
      expect((result.finalData as TweetWorkflow)?.posted).toBe(true);
      expect((result.finalData as TweetWorkflow)?.reply).toBe('Reply to: Hello world');
    });

    it('should handle data validation workflow', async () => {
      interface ValidationWorkflow {
        input: string;
        validated?: boolean;
        cleaned?: string;
        processed?: string;
      }

      const pipeline = createPipeline<ValidationWorkflow>()
        .step('validate', async (ctx) => {
          if (!ctx.input || ctx.input.trim() === '') {
            throw new Error('Input is empty');
          }
          return { ...ctx, validated: true };
        })
        .step('clean', async (ctx) => ({
          ...ctx,
          cleaned: ctx.input.trim().toLowerCase(),
        }))
        .step('process', async (ctx) => ({
          ...ctx,
          processed: ctx.cleaned!.replace(/\s+/g, '-'),
        }));

      const result = await pipeline.execute({ input: '  Hello World  ' });

      expect(result.success).toBe(true);
      expect((result.finalData as ValidationWorkflow)?.processed).toBe('hello-world');
    });
  });
});
