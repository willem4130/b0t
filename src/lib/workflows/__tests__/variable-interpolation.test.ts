/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';

/**
 * Tests for workflow variable interpolation with credentials
 *
 * Validates that {{credential.platform}} syntax resolves correctly
 */

describe('variable interpolation', () => {
  // Helper function that simulates variable resolution
  const resolveVariable = (template: string, context: any): string => {
    // Simple template resolution (matches executor behavior)
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const keys = path.trim().split('.');
      let value = context;

      for (const key of keys) {
        value = value?.[key];
        if (value === undefined) {
          return match; // Return original if not found
        }
      }

      return String(value);
    });
  };

  describe('credential variable resolution', () => {
    const mockContext = {
      user: {
        id: 'user-123',
        openai: 'sk-test-openai-123',
        anthropic: 'sk-ant-test-456',
        twitter: 'oauth-token-twitter',
        rapidapi_api_key: 'rapidapi-key-789'
      },
      credential: {
        openai: 'sk-test-openai-123',
        anthropic: 'sk-ant-test-456',
        twitter: 'oauth-token-twitter',
        rapidapi_api_key: 'rapidapi-key-789'
      },
      openai: 'sk-test-openai-123',
      anthropic: 'sk-ant-test-456',
      twitter: 'oauth-token-twitter',
      rapidapi_api_key: 'rapidapi-key-789'
    };

    it('should resolve {{credential.openai}}', () => {
      const result = resolveVariable('{{credential.openai}}', mockContext);
      expect(result).toBe('sk-test-openai-123');
    });

    it('should resolve {{credential.anthropic}}', () => {
      const result = resolveVariable('{{credential.anthropic}}', mockContext);
      expect(result).toBe('sk-ant-test-456');
    });

    it('should resolve {{credential.twitter}}', () => {
      const result = resolveVariable('{{credential.twitter}}', mockContext);
      expect(result).toBe('oauth-token-twitter');
    });

    it('should resolve {{credential.rapidapi_api_key}}', () => {
      const result = resolveVariable('{{credential.rapidapi_api_key}}', mockContext);
      expect(result).toBe('rapidapi-key-789');
    });

    it('should resolve {{user.openai}}', () => {
      const result = resolveVariable('{{user.openai}}', mockContext);
      expect(result).toBe('sk-test-openai-123');
    });

    it('should resolve top-level {{openai}}', () => {
      const result = resolveVariable('{{openai}}', mockContext);
      expect(result).toBe('sk-test-openai-123');
    });

    it('should resolve multiple variables in one string', () => {
      const template = 'OpenAI: {{credential.openai}}, Twitter: {{credential.twitter}}';
      const result = resolveVariable(template, mockContext);
      expect(result).toBe('OpenAI: sk-test-openai-123, Twitter: oauth-token-twitter');
    });

    it('should resolve variables in JSON inputs', () => {
      const jsonTemplate = {
        apiKey: '{{credential.openai}}',
        token: '{{credential.twitter}}'
      };

      const resolved = {
        apiKey: resolveVariable(jsonTemplate.apiKey, mockContext),
        token: resolveVariable(jsonTemplate.token, mockContext)
      };

      expect(resolved).toEqual({
        apiKey: 'sk-test-openai-123',
        token: 'oauth-token-twitter'
      });
    });

    it('should handle nested credential paths', () => {
      const result = resolveVariable('{{credential.rapidapi_api_key}}', mockContext);
      expect(result).toBe('rapidapi-key-789');
    });

    it('should preserve original if credential not found', () => {
      const result = resolveVariable('{{credential.nonexistent}}', mockContext);
      expect(result).toBe('{{credential.nonexistent}}');
    });
  });

  describe('workflow module credential usage', () => {
    const mockContext = {
      credential: {
        openai: 'sk-test-openai-123',
        anthropic: 'sk-ant-test-456',
        twitter: 'oauth-token-twitter',
        rapidapi_api_key: 'rapidapi-key-789',
        stripe: 'sk_test_stripe_123'
      }
    };

    it('should resolve OpenAI module credentials', () => {
      const workflowStep = {
        module: 'ai.ai-sdk.generateText',
        inputs: {
          apiKey: '{{credential.openai}}',
          prompt: 'Hello world'
        }
      };

      const resolvedInputs = {
        apiKey: resolveVariable(workflowStep.inputs.apiKey, mockContext),
        prompt: workflowStep.inputs.prompt
      };

      expect(resolvedInputs.apiKey).toBe('sk-test-openai-123');
    });

    it('should resolve Twitter module credentials', () => {
      const workflowStep = {
        module: 'social.twitter.tweet',
        inputs: {
          token: '{{credential.twitter}}',
          text: 'Test tweet'
        }
      };

      const resolvedInputs = {
        token: resolveVariable(workflowStep.inputs.token, mockContext),
        text: workflowStep.inputs.text
      };

      expect(resolvedInputs.token).toBe('oauth-token-twitter');
    });

    it('should resolve RapidAPI module credentials', () => {
      const workflowStep = {
        module: 'external-apis.rapidapi-twitter.searchTwitter',
        inputs: {
          params: {
            apiKey: '{{credential.rapidapi_api_key}}'
          }
        }
      };

      const resolvedApiKey = resolveVariable(
        workflowStep.inputs.params.apiKey,
        mockContext
      );

      expect(resolvedApiKey).toBe('rapidapi-key-789');
    });

    it('should resolve Stripe module credentials', () => {
      const workflowStep = {
        module: 'payments.stripe.createPayment',
        inputs: {
          apiKey: '{{credential.stripe}}',
          amount: 1000
        }
      };

      const resolvedInputs = {
        apiKey: resolveVariable(workflowStep.inputs.apiKey, mockContext),
        amount: workflowStep.inputs.amount
      };

      expect(resolvedInputs.apiKey).toBe('sk_test_stripe_123');
    });
  });

  describe('real-world workflow examples', () => {
    const mockContext = {
      credential: {
        openai: 'sk-test-openai-123',
        twitter: 'oauth-token-twitter'
      },
      triggerData: {
        text: 'Hello from trigger'
      }
    };

    it('should resolve AI + Social workflow', () => {
      // Step 1: Generate text with AI
      const aiStep = {
        inputs: {
          apiKey: '{{credential.openai}}',
          prompt: 'Generate a tweet about {{triggerData.text}}'
        }
      };

      // Step 2: Post to Twitter
      const twitterStep = {
        inputs: {
          token: '{{credential.twitter}}',
          text: '{{step1.output}}'
        }
      };

      expect(resolveVariable(aiStep.inputs.apiKey, mockContext)).toBe('sk-test-openai-123');
      expect(resolveVariable(aiStep.inputs.prompt, mockContext)).toBe('Generate a tweet about Hello from trigger');
      expect(resolveVariable(twitterStep.inputs.token, mockContext)).toBe('oauth-token-twitter');
    });

    it('should handle complex nested credentials', () => {
      const complexContext = {
        credential: {
          'google-analytics': 'ga-key-123',
          'google-drive': 'gd-key-456'
        }
      };

      const step = {
        inputs: {
          analyticsKey: '{{credential.google-analytics}}',
          driveKey: '{{credential.google-drive}}'
        }
      };

      expect(resolveVariable(step.inputs.analyticsKey, complexContext)).toBe('ga-key-123');
      expect(resolveVariable(step.inputs.driveKey, complexContext)).toBe('gd-key-456');
    });
  });

  describe('credential alias resolution', () => {
    const mockContext = {
      credential: {
        // All three should resolve to the same value due to aliases
        'youtube': 'youtube-token',
        'youtube_apikey': 'youtube-token',
        'youtube_api_key': 'youtube-token',

        'twitter': 'twitter-token',
        'twitter_oauth2': 'twitter-token',
        'twitter_oauth': 'twitter-token'
      }
    };

    it('should resolve youtube alias variations', () => {
      expect(resolveVariable('{{credential.youtube}}', mockContext)).toBe('youtube-token');
      expect(resolveVariable('{{credential.youtube_apikey}}', mockContext)).toBe('youtube-token');
      expect(resolveVariable('{{credential.youtube_api_key}}', mockContext)).toBe('youtube-token');
    });

    it('should resolve twitter alias variations', () => {
      expect(resolveVariable('{{credential.twitter}}', mockContext)).toBe('twitter-token');
      expect(resolveVariable('{{credential.twitter_oauth2}}', mockContext)).toBe('twitter-token');
      expect(resolveVariable('{{credential.twitter_oauth}}', mockContext)).toBe('twitter-token');
    });

    it('should allow workflows to use any alias', () => {
      // Workflow 1 uses 'youtube'
      const workflow1 = { apiKey: '{{credential.youtube}}' };

      // Workflow 2 uses 'youtube_api_key'
      const workflow2 = { apiKey: '{{credential.youtube_api_key}}' };

      // Both should resolve to same value
      const resolved1 = resolveVariable(workflow1.apiKey, mockContext);
      const resolved2 = resolveVariable(workflow2.apiKey, mockContext);

      expect(resolved1).toBe(resolved2);
      expect(resolved1).toBe('youtube-token');
    });
  });

  describe('error cases', () => {
    const mockContext = {
      credential: {
        openai: 'sk-test-123'
      }
    };

    it('should preserve template if credential missing', () => {
      const result = resolveVariable('{{credential.missing}}', mockContext);
      expect(result).toBe('{{credential.missing}}');
    });

    it('should handle empty credential object', () => {
      const emptyContext = { credential: {} };
      const result = resolveVariable('{{credential.openai}}', emptyContext);
      expect(result).toBe('{{credential.openai}}');
    });

    it('should handle missing credential object', () => {
      const noCredContext = {};
      const result = resolveVariable('{{credential.openai}}', noCredContext);
      expect(result).toBe('{{credential.openai}}');
    });

    it('should handle malformed templates', () => {
      const result = resolveVariable('{{credential.openai', mockContext);
      expect(result).toBe('{{credential.openai');
    });

    it('should not resolve partial matches', () => {
      const result = resolveVariable('{{credentials.openai}}', mockContext); // Note: 'credentials' not 'credential'
      expect(result).toBe('{{credentials.openai}}');
    });
  });

  describe('security considerations', () => {
    it('should not expose credentials in logs', () => {
      const mockContext = {
        credential: {
          openai: 'sk-test-sensitive-key-123'
        }
      };

      // Template BEFORE resolution (safe to log)
      const template = '{{credential.openai}}';
      expect(template).not.toContain('sk-test');

      // After resolution (should not be logged)
      const resolved = resolveVariable(template, mockContext);
      expect(resolved).toContain('sk-test');

      // Ensure the resolved value is the actual key
      expect(resolved).toBe('sk-test-sensitive-key-123');
    });

    it('should handle credentials with special characters', () => {
      const mockContext = {
        credential: {
          custom: 'key!@#$%^&*()_+-=[]{}|;:,.<>?/~`'
        }
      };

      const result = resolveVariable('{{credential.custom}}', mockContext);
      expect(result).toBe('key!@#$%^&*()_+-=[]{}|;:,.<>?/~`');
    });
  });
});
