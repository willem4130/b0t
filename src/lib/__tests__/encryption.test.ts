import { describe, it, expect, beforeEach } from 'vitest';
import { encrypt, decrypt } from '../encryption';

/**
 * Tests for encryption module
 *
 * Validates AES-256-CBC encryption/decryption used for credentials
 */

describe('encryption', () => {
  beforeEach(() => {
    // Set test encryption key
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';
  });

  describe('encrypt', () => {
    it('should encrypt a string value', () => {
      const plaintext = 'sk-test-api-key-12345';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(':'); // IV:encrypted format
    });

    it('should produce different ciphertext for same input (random IV)', () => {
      const plaintext = 'sk-test-api-key-12345';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2); // Different IVs
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should encrypt empty string', () => {
      const encrypted = encrypt('');
      expect(encrypted).toBeDefined();
      expect(decrypt(encrypted)).toBe('');
    });

    it('should encrypt special characters', () => {
      const plaintext = 'key!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('should encrypt unicode characters', () => {
      const plaintext = '🔑🔐🛡️ API Key: sk-测试-日本語-한국어';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('should encrypt long strings', () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });
  });

  describe('decrypt', () => {
    it('should decrypt an encrypted string', () => {
      const plaintext = 'sk-test-api-key-12345';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle multi-field credential values', () => {
      const credentials = {
        client_id: 'test-client-id-123',
        client_secret: 'test-client-secret-456',
        api_key: 'sk-test-789'
      };

      const encrypted = Object.entries(credentials).reduce((acc, [key, value]) => {
        acc[key] = encrypt(value);
        return acc;
      }, {} as Record<string, string>);

      const decrypted = Object.entries(encrypted).reduce((acc, [key, value]) => {
        acc[key] = decrypt(value);
        return acc;
      }, {} as Record<string, string>);

      expect(decrypted).toEqual(credentials);
    });

    it('should throw error for invalid encrypted format', () => {
      expect(() => decrypt('invalid-format')).toThrow('Invalid encrypted data format');
    });

    it('should throw error for malformed IV', () => {
      expect(() => decrypt('invalid:data')).toThrow();
    });

    it('should throw error for empty string', () => {
      expect(() => decrypt('')).toThrow('Invalid encrypted data format');
    });
  });

  describe('round-trip encryption', () => {
    const testCases = [
      { name: 'OpenAI API key', value: 'sk-proj-1234567890abcdefghijklmnopqrstuvwxyz' },
      { name: 'Anthropic API key', value: 'sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz' },
      { name: 'Twitter OAuth token', value: 'AAAAAAAAAAAAAAAAAAAAABcdefghijklmnopqrstuvwxyz' },
      { name: 'Stripe API key', value: 'sk_test_51234567890abcdefghijklmnopqrstuvwxyz' },
      { name: 'AWS Access Key', value: 'AKIAIOSFODNN7EXAMPLE' },
      { name: 'Database connection string', value: 'postgresql://user:pass@localhost:5432/db?ssl=true' },
      { name: 'JSON Web Token', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ' }
    ];

    testCases.forEach(({ name, value }) => {
      it(`should encrypt and decrypt ${name}`, () => {
        const encrypted = encrypt(value);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(value);
      });
    });
  });

  describe('security properties', () => {
    it('should use different IV for each encryption', () => {
      const plaintext = 'test-value';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      const iv1 = encrypted1.split(':')[0];
      const iv2 = encrypted2.split(':')[0];

      expect(iv1).not.toBe(iv2); // Different IVs
      expect(iv1.length).toBe(32); // 16 bytes in hex = 32 chars
      expect(iv2.length).toBe(32);
    });

    it('should produce ciphertext that appears random', () => {
      const encrypted = encrypt('test');
      const ciphertext = encrypted.split(':')[1];

      // Ciphertext should be hex-encoded
      expect(ciphertext).toMatch(/^[0-9a-f]+$/);

      // Should not contain original text
      expect(ciphertext).not.toContain('test');
    });

    it('should handle encryption key from environment', () => {
      process.env.ENCRYPTION_KEY = 'another-test-key';
      const plaintext = 'test-value';

      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });
});
