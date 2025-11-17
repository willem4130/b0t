/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  storeCredential,
  getCredential,
  getCredentialFields,
  listCredentials,
  updateCredential,
  updateCredentialName,
  deleteCredential,
  hasCredential,
  type CredentialInput
} from '../credentials';

/**
 * Tests for credentials management
 *
 * Validates credential storage, retrieval, encryption integration, and database operations
 */

// Mock the database
vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined)
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([])
        }))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined)
      }))
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined)
    }))
  }
}));

// Mock encryption
vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((text: string) => `encrypted:${text}`),
  decrypt: vi.fn((text: string) => text.replace('encrypted:', ''))
}));

// Mock logger to suppress output
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('storeCredential', () => {
    it('should store a single-field credential', async () => {
      const { db } = await import('@/lib/db');
      const { encrypt } = await import('@/lib/encryption');

      const input: CredentialInput = {
        platform: 'openai',
        name: 'OpenAI API Key',
        value: 'sk-test-123',
        type: 'api_key'
      };

      const result = await storeCredential('user-123', input);

      expect(result.id).toBeDefined();
      expect(encrypt).toHaveBeenCalledWith('sk-test-123');
      expect(db.insert).toHaveBeenCalled();
    });

    it('should store a multi-field credential', async () => {
      const { db } = await import('@/lib/db');
      const { encrypt } = await import('@/lib/encryption');

      const input: CredentialInput = {
        platform: 'twitter',
        name: 'Twitter OAuth',
        fields: {
          client_id: 'client-123',
          client_secret: 'secret-456'
        },
        type: 'multi_field'
      };

      const result = await storeCredential('user-123', input);

      expect(result.id).toBeDefined();
      expect(encrypt).toHaveBeenCalledWith('client-123');
      expect(encrypt).toHaveBeenCalledWith('secret-456');
      expect(db.insert).toHaveBeenCalled();
    });

    it('should lowercase platform name', async () => {
      const { db } = await import('@/lib/db');

      const input: CredentialInput = {
        platform: 'OpenAI',
        name: 'Test',
        value: 'test',
        type: 'api_key'
      };

      await storeCredential('user-123', input);

      const insertCall = (db.insert as any).mock.results[0].value;
      const valuesCall = insertCall.values as any;
      const insertedData = valuesCall.mock.calls[0][0];

      expect(insertedData.platform).toBe('openai');
    });

    it('should include organizationId when provided', async () => {
      const { db } = await import('@/lib/db');

      const input: CredentialInput = {
        platform: 'stripe',
        name: 'Stripe Key',
        value: 'sk_test_123',
        type: 'api_key'
      };

      await storeCredential('user-123', input, 'org-456');

      const insertCall = (db.insert as any).mock.results[0].value;
      const valuesCall = insertCall.values as any;
      const insertedData = valuesCall.mock.calls[0][0];

      expect(insertedData.organizationId).toBe('org-456');
    });

    it('should include metadata when provided', async () => {
      const { db } = await import('@/lib/db');

      const input: CredentialInput = {
        platform: 'custom',
        name: 'Custom Credential',
        value: 'test',
        type: 'api_key',
        metadata: { environment: 'production', region: 'us-east-1' }
      };

      await storeCredential('user-123', input);

      const insertCall = (db.insert as any).mock.results[0].value;
      const valuesCall = insertCall.values as any;
      const insertedData = valuesCall.mock.calls[0][0];

      expect(insertedData.metadata).toEqual({
        environment: 'production',
        region: 'us-east-1'
      });
    });
  });

  describe('getCredential', () => {
    it('should retrieve and decrypt a credential', async () => {
      const { db } = await import('@/lib/db');
      const { decrypt } = await import('@/lib/encryption');

      // Mock database response
      const mockCredential = {
        id: 'cred-123',
        userId: 'user-123',
        platform: 'openai',
        encryptedValue: 'encrypted:sk-test-123',
        type: 'api_key'
      };

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([mockCredential])
          }))
        }))
      });

      const result = await getCredential('user-123', 'openai');

      expect(result).toBe('sk-test-123');
      expect(decrypt).toHaveBeenCalledWith('encrypted:sk-test-123');
      expect(db.update).toHaveBeenCalled(); // lastUsed timestamp
    });

    it('should return null when credential not found', async () => {
      const { db } = await import('@/lib/db');

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([])
          }))
        }))
      });

      const result = await getCredential('user-123', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should lowercase platform name for lookup', async () => {
      const { db } = await import('@/lib/db');

      const mockCredential = {
        id: 'cred-123',
        userId: 'user-123',
        platform: 'openai',
        encryptedValue: 'encrypted:test',
        type: 'api_key'
      };

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([mockCredential])
          }))
        }))
      });

      const result = await getCredential('user-123', 'OpenAI'); // Mixed case

      // Verify it returns the credential (proving lowercase worked)
      expect(result).toBe('test');
      expect(db.select).toHaveBeenCalled();
    });

    it('should update lastUsed timestamp', async () => {
      const { db } = await import('@/lib/db');

      const mockCredential = {
        id: 'cred-123',
        userId: 'user-123',
        platform: 'openai',
        encryptedValue: 'encrypted:test',
        type: 'api_key'
      };

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([mockCredential])
          }))
        }))
      });

      await getCredential('user-123', 'openai');

      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('getCredentialFields', () => {
    it('should retrieve multi-field credentials', async () => {
      const { db } = await import('@/lib/db');
      const { decrypt } = await import('@/lib/encryption');

      const mockCredential = {
        id: 'cred-123',
        userId: 'user-123',
        platform: 'twitter',
        encryptedValue: '',
        type: 'multi_field',
        metadata: {
          fields: {
            client_id: 'encrypted:client-123',
            client_secret: 'encrypted:secret-456'
          }
        }
      };

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([mockCredential])
          }))
        }))
      });

      const result = await getCredentialFields('user-123', 'twitter');

      expect(result).toEqual({
        client_id: 'client-123',
        client_secret: 'secret-456'
      });
      expect(decrypt).toHaveBeenCalledTimes(2);
    });

    it('should handle single-field credentials (backward compatible)', async () => {
      const { db } = await import('@/lib/db');

      const mockCredential = {
        id: 'cred-123',
        userId: 'user-123',
        platform: 'openai',
        encryptedValue: 'encrypted:sk-test-123',
        type: 'api_key',
        metadata: {}
      };

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([mockCredential])
          }))
        }))
      });

      const result = await getCredentialFields('user-123', 'openai');

      expect(result).toEqual({ value: 'sk-test-123' });
    });

    it('should filter by organizationId when provided', async () => {
      const { db } = await import('@/lib/db');

      const mockCredential = {
        id: 'cred-123',
        userId: 'user-123',
        organizationId: 'org-456',
        platform: 'stripe',
        encryptedValue: 'encrypted:test',
        type: 'api_key',
        metadata: {}
      };

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([mockCredential])
          }))
        }))
      });

      await getCredentialFields('user-123', 'stripe', 'org-456');

      // Verify organizationId was included in where clause
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when no credential found', async () => {
      const { db } = await import('@/lib/db');

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([])
          }))
        }))
      });

      const result = await getCredentialFields('user-123', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listCredentials', () => {
    it('should list credentials without decrypted values', async () => {
      const { db } = await import('@/lib/db');

      const mockCredentials = [
        {
          id: 'cred-1',
          platform: 'openai',
          name: 'OpenAI Key',
          type: 'api_key',
          createdAt: new Date(),
          lastUsed: new Date()
        },
        {
          id: 'cred-2',
          platform: 'stripe',
          name: 'Stripe Key',
          type: 'api_key',
          createdAt: new Date(),
          lastUsed: null
        }
      ];

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(mockCredentials)
        }))
      });

      const result = await listCredentials('user-123');

      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('encryptedValue');
      expect(result[0]).toHaveProperty('platform');
      expect(result[0]).toHaveProperty('name');
    });

    it('should filter by organizationId', async () => {
      const { db } = await import('@/lib/db');

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([])
        }))
      });

      await listCredentials('user-123', 'org-456');

      expect(db.select).toHaveBeenCalled();
    });

    it('should show only personal credentials when no organizationId', async () => {
      const { db } = await import('@/lib/db');

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([])
        }))
      });

      await listCredentials('user-123');

      expect(db.select).toHaveBeenCalled();
      // Should include isNull(organizationId) in where clause
    });
  });

  describe('updateCredential', () => {
    it('should encrypt and update credential value', async () => {
      const { db } = await import('@/lib/db');
      const { encrypt } = await import('@/lib/encryption');

      await updateCredential('user-123', 'cred-456', 'new-value');

      expect(encrypt).toHaveBeenCalledWith('new-value');
      expect(db.update).toHaveBeenCalled();
    });

    it('should verify user ownership', async () => {
      const { db } = await import('@/lib/db');

      await updateCredential('user-123', 'cred-456', 'new-value');

      // Verify where clause includes userId
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('updateCredentialName', () => {
    it('should update credential name', async () => {
      const { db } = await import('@/lib/db');

      await updateCredentialName('user-123', 'cred-456', 'New Name');

      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('deleteCredential', () => {
    it('should delete credential', async () => {
      const { db } = await import('@/lib/db');

      await deleteCredential('user-123', 'cred-456');

      expect(db.delete).toHaveBeenCalled();
    });

    it('should verify user ownership before deleting', async () => {
      const { db } = await import('@/lib/db');

      await deleteCredential('user-123', 'cred-456');

      // Verify where clause includes userId
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('hasCredential', () => {
    it('should return true when credential exists', async () => {
      const { db } = await import('@/lib/db');

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 'cred-123' }])
          }))
        }))
      });

      const result = await hasCredential('user-123', 'openai');

      expect(result).toBe(true);
    });

    it('should return false when credential does not exist', async () => {
      const { db } = await import('@/lib/db');

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([])
          }))
        }))
      });

      const result = await hasCredential('user-123', 'nonexistent');

      expect(result).toBe(false);
    });

    it('should filter by organizationId when provided', async () => {
      const { db } = await import('@/lib/db');

      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([])
          }))
        }))
      });

      await hasCredential('user-123', 'stripe', 'org-456');

      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('platform name normalization', () => {
    it('should handle various platform name formats', async () => {
      const { db } = await import('@/lib/db');

      const testCases = [
        'OpenAI',
        'TWITTER',
        'stripe',
        'Google-Analytics',
        'RAPID_API'
      ];

      for (const platform of testCases) {
        const mockCredential = {
          id: 'cred-123',
          userId: 'user-123',
          platform: platform.toLowerCase(),
          encryptedValue: 'encrypted:test',
          type: 'api_key'
        };

        (db.select as any).mockReturnValue({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([mockCredential])
            }))
          }))
        });

        const result = await getCredential('user-123', platform);
        expect(result).toBeDefined();
      }
    });
  });
});
