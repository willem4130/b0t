import { describe, it, expect } from 'vitest';
import {
  tweetSchema,
  createTweetSchema,
  youtubeVideoSchema,
  youtubeCommentSchema,
  triggerJobSchema,
  cronScheduleSchema,
  promptSchema,
  automationConfigSchema,
  apiSuccessSchema,
  apiErrorSchema,
} from './validations';

describe('validations', () => {
  describe('tweetSchema', () => {
    it('should validate a valid tweet', () => {
      const tweet = {
        content: 'Hello world',
        status: 'draft' as const,
      };

      const result = tweetSchema.parse(tweet);
      expect(result.content).toBe('Hello world');
      expect(result.status).toBe('draft');
    });

    it('should use default status', () => {
      const tweet = {
        content: 'Hello world',
      };

      const result = tweetSchema.parse(tweet);
      expect(result.status).toBe('draft');
    });

    it('should accept optional tweetId', () => {
      const tweet = {
        content: 'Hello world',
        status: 'posted' as const,
        tweetId: '123456',
      };

      const result = tweetSchema.parse(tweet);
      expect(result.tweetId).toBe('123456');
    });

    it('should reject tweets over 280 characters', () => {
      const tweet = {
        content: 'a'.repeat(281),
        status: 'draft' as const,
      };

      expect(() => tweetSchema.parse(tweet)).toThrow();
    });

    it('should reject empty tweets', () => {
      const tweet = {
        content: '',
        status: 'draft' as const,
      };

      expect(() => tweetSchema.parse(tweet)).toThrow();
    });

    it('should reject invalid status', () => {
      const tweet = {
        content: 'Hello',
        status: 'invalid',
      };

      expect(() => tweetSchema.parse(tweet)).toThrow();
    });

    it('should validate all status options', () => {
      const statuses = ['draft', 'posted', 'failed'] as const;

      for (const status of statuses) {
        const result = tweetSchema.parse({
          content: 'Test',
          status,
        });
        expect(result.status).toBe(status);
      }
    });
  });

  describe('createTweetSchema', () => {
    it('should validate a valid tweet', () => {
      const tweet = { content: 'Hello world' };
      const result = createTweetSchema.parse(tweet);
      expect(result.content).toBe('Hello world');
    });

    it('should reject empty content', () => {
      expect(() => createTweetSchema.parse({ content: '' })).toThrow();
    });

    it('should reject tweets over 280 characters', () => {
      expect(() => createTweetSchema.parse({ content: 'a'.repeat(281) })).toThrow();
    });

    it('should accept exactly 280 characters', () => {
      const content = 'a'.repeat(280);
      const result = createTweetSchema.parse({ content });
      expect(result.content).toBe(content);
    });
  });

  describe('youtubeVideoSchema', () => {
    it('should validate a valid video', () => {
      const video = {
        videoId: 'abc123',
        title: 'My Video',
        channelId: 'channel123',
      };

      const result = youtubeVideoSchema.parse(video);
      expect(result.videoId).toBe('abc123');
      expect(result.title).toBe('My Video');
      expect(result.channelId).toBe('channel123');
    });

    it('should require videoId', () => {
      expect(() => youtubeVideoSchema.parse({})).toThrow();
    });

    it('should allow optional title and channelId', () => {
      const video = { videoId: 'abc123' };
      const result = youtubeVideoSchema.parse(video);
      expect(result.videoId).toBe('abc123');
      expect(result.title).toBeUndefined();
      expect(result.channelId).toBeUndefined();
    });

    it('should reject empty videoId', () => {
      expect(() => youtubeVideoSchema.parse({ videoId: '' })).toThrow();
    });
  });

  describe('youtubeCommentSchema', () => {
    it('should validate a valid comment', () => {
      const comment = {
        commentId: 'comment123',
        videoId: 'video123',
        text: 'Great video!',
        authorDisplayName: 'John Doe',
      };

      const result = youtubeCommentSchema.parse(comment);
      expect(result.commentId).toBe('comment123');
      expect(result.videoId).toBe('video123');
      expect(result.text).toBe('Great video!');
      expect(result.authorDisplayName).toBe('John Doe');
    });

    it('should require commentId, videoId, and text', () => {
      expect(() => youtubeCommentSchema.parse({})).toThrow();
      expect(() => youtubeCommentSchema.parse({ commentId: 'c1' })).toThrow();
      expect(() => youtubeCommentSchema.parse({ commentId: 'c1', videoId: 'v1' })).toThrow();
    });

    it('should allow optional authorDisplayName', () => {
      const comment = {
        commentId: 'c1',
        videoId: 'v1',
        text: 'Test',
      };

      const result = youtubeCommentSchema.parse(comment);
      expect(result.authorDisplayName).toBeUndefined();
    });
  });

  describe('triggerJobSchema', () => {
    it('should validate a valid job trigger', () => {
      const trigger = { job: 'twitter-post' };
      const result = triggerJobSchema.parse(trigger);
      expect(result.job).toBe('twitter-post');
    });

    it('should reject empty job name', () => {
      expect(() => triggerJobSchema.parse({ job: '' })).toThrow();
    });

    it('should require job field', () => {
      expect(() => triggerJobSchema.parse({})).toThrow();
    });
  });

  describe('cronScheduleSchema', () => {
    it('should validate valid cron expressions', () => {
      const validCrons = [
        '* * * * *',           // Every minute
        '0 * * * *',           // Every hour
        '0 0 * * *',           // Every day at midnight
        '*/5 * * * *',         // Every 5 minutes
        '0 */2 * * *',         // Every 2 hours
        '0 0 1 * *',           // First day of month
        '0 0 * * 0',           // Every Sunday
      ];

      for (const schedule of validCrons) {
        const result = cronScheduleSchema.parse({ schedule });
        expect(result.schedule).toBe(schedule);
        expect(result.enabled).toBe(false); // Default value
      }
    });

    it('should use default enabled value', () => {
      const result = cronScheduleSchema.parse({ schedule: '* * * * *' });
      expect(result.enabled).toBe(false);
    });

    it('should accept custom enabled value', () => {
      const result = cronScheduleSchema.parse({
        schedule: '* * * * *',
        enabled: true,
      });
      expect(result.enabled).toBe(true);
    });

    it('should reject invalid cron expressions', () => {
      const invalidCrons = [
        'invalid',
        '60 * * * *',         // Invalid minute
        '* 24 * * *',         // Invalid hour
        '* * 32 * *',         // Invalid day
        '* * * 13 *',         // Invalid month
        '* * * * 7',          // Invalid day of week
        '* * *',              // Too few fields
      ];

      for (const schedule of invalidCrons) {
        expect(() => cronScheduleSchema.parse({ schedule })).toThrow();
      }
    });
  });

  describe('promptSchema', () => {
    it('should validate a valid prompt', () => {
      const prompt = {
        prompt: 'Write a tweet about AI',
        model: 'gpt-4',
      };

      const result = promptSchema.parse(prompt);
      expect(result.prompt).toBe('Write a tweet about AI');
      expect(result.model).toBe('gpt-4');
    });

    it('should use default model', () => {
      const result = promptSchema.parse({
        prompt: 'Write a tweet about AI',
      });
      expect(result.model).toBe('gpt-4o-mini');
    });

    it('should reject prompts under 10 characters', () => {
      expect(() => promptSchema.parse({ prompt: 'Short' })).toThrow();
    });

    it('should reject prompts over 2000 characters', () => {
      const longPrompt = 'a'.repeat(2001);
      expect(() => promptSchema.parse({ prompt: longPrompt })).toThrow();
    });

    it('should accept exactly 10 characters', () => {
      const result = promptSchema.parse({ prompt: '1234567890' });
      expect(result.prompt).toBe('1234567890');
    });

    it('should accept exactly 2000 characters', () => {
      const prompt = 'a'.repeat(2000);
      const result = promptSchema.parse({ prompt });
      expect(result.prompt.length).toBe(2000);
    });
  });

  describe('automationConfigSchema', () => {
    it('should validate a valid automation config', () => {
      const config = {
        jobName: 'twitter-post',
        schedule: '0 */2 * * *',
        prompt: 'Generate a tweet',
        enabled: true,
      };

      const result = automationConfigSchema.parse(config);
      expect(result.jobName).toBe('twitter-post');
      expect(result.schedule).toBe('0 */2 * * *');
      expect(result.prompt).toBe('Generate a tweet');
      expect(result.enabled).toBe(true);
    });

    it('should require all fields', () => {
      expect(() => automationConfigSchema.parse({})).toThrow();
      expect(() => automationConfigSchema.parse({ jobName: 'test' })).toThrow();
      expect(() => automationConfigSchema.parse({
        jobName: 'test',
        schedule: '* * * * *',
      })).toThrow();
    });

    it('should reject empty strings', () => {
      const config = {
        jobName: '',
        schedule: '* * * * *',
        prompt: 'Test',
        enabled: false,
      };

      expect(() => automationConfigSchema.parse(config)).toThrow();
    });
  });

  describe('apiSuccessSchema', () => {
    it('should validate a success response', () => {
      const response = {
        success: true,
        message: 'Operation completed',
        data: { id: '123' },
      };

      const result = apiSuccessSchema.parse(response);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Operation completed');
      expect(result.data).toEqual({ id: '123' });
    });

    it('should allow optional data field', () => {
      const response = {
        success: true,
        message: 'Operation completed',
      };

      const result = apiSuccessSchema.parse(response);
      expect(result.data).toBeUndefined();
    });

    it('should accept any data type', () => {
      const dataTypes = [
        'string',
        123,
        true,
        { key: 'value' },
        [1, 2, 3],
        null,
      ];

      for (const data of dataTypes) {
        const result = apiSuccessSchema.parse({
          success: true,
          message: 'Test',
          data,
        });
        expect(result.data).toEqual(data);
      }
    });

    it('should require success and message', () => {
      expect(() => apiSuccessSchema.parse({})).toThrow();
      expect(() => apiSuccessSchema.parse({ success: true })).toThrow();
      expect(() => apiSuccessSchema.parse({ message: 'Test' })).toThrow();
    });
  });

  describe('apiErrorSchema', () => {
    it('should validate an error response', () => {
      const response = {
        error: 'Something went wrong',
        details: 'Detailed error message',
        code: 'ERR_001',
      };

      const result = apiErrorSchema.parse(response);
      expect(result.error).toBe('Something went wrong');
      expect(result.details).toBe('Detailed error message');
      expect(result.code).toBe('ERR_001');
    });

    it('should allow optional details and code', () => {
      const response = {
        error: 'Something went wrong',
      };

      const result = apiErrorSchema.parse(response);
      expect(result.details).toBeUndefined();
      expect(result.code).toBeUndefined();
    });

    it('should require error field', () => {
      expect(() => apiErrorSchema.parse({})).toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle unicode in tweets', () => {
      const tweet = {
        content: 'Hello 世界 🌍',
        status: 'draft' as const,
      };

      const result = tweetSchema.parse(tweet);
      expect(result.content).toBe('Hello 世界 🌍');
    });

    it('should handle special characters in prompts', () => {
      const prompt = {
        prompt: 'Write about "quotes" & <tags> $symbols',
      };

      const result = promptSchema.parse(prompt);
      expect(result.prompt).toBe('Write about "quotes" & <tags> $symbols');
    });

    it('should handle whitespace in validation', () => {
      const tweet = { content: '   Hello world   ' };
      const result = createTweetSchema.parse(tweet);
      expect(result.content).toBe('   Hello world   ');
    });

    it('should handle newlines in content', () => {
      const tweet = {
        content: 'Line 1\nLine 2\nLine 3',
        status: 'draft' as const,
      };

      const result = tweetSchema.parse(tweet);
      expect(result.content).toContain('\n');
    });
  });

  describe('type inference', () => {
    it('should correctly infer types', () => {
      const tweet = tweetSchema.parse({
        content: 'Test',
        status: 'posted' as const,
      });

      // Type checks (these will fail at compile time if types are wrong)
      const _content: string = tweet.content;
      const _status: 'draft' | 'posted' | 'failed' = tweet.status;

      expect(_content).toBe('Test');
      expect(_status).toBe('posted');
    });
  });
});
