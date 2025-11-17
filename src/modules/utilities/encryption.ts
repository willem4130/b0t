import crypto from 'crypto';
import { logger } from '@/lib/logger';

/**
 * Encryption & Security Module
 *
 * Cryptographic operations and security utilities
 * - AES encryption/decryption
 * - RSA public/private key encryption
 * - Hashing (SHA-256, MD5, etc.)
 * - JWT token generation/verification
 * - Password hashing with bcrypt
 * - Random string generation
 *
 * Perfect for:
 * - Sensitive data protection
 * - API authentication
 * - Password management
 * - Secure token generation
 */

export interface AESEncryptionOptions {
  algorithm?: 'aes-256-cbc' | 'aes-256-gcm' | 'aes-192-cbc' | 'aes-128-cbc';
  key: string | Buffer;
  iv?: Buffer;
}

export interface RSAKeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Generate AES encryption key
 */
export function generateAESKey(length: 32 | 24 | 16 = 32): Buffer {
  logger.info({ length }, 'Generating AES key');

  return crypto.randomBytes(length);
}

/**
 * Generate initialization vector (IV)
 */
export function generateIV(): Buffer {
  return crypto.randomBytes(16);
}

/**
 * Encrypt data with AES
 */
export function encryptAES(
  data: string,
  options: AESEncryptionOptions
): { encrypted: string; iv: string; tag?: string } {
  logger.info({ algorithm: options.algorithm }, 'Encrypting with AES');

  try {
    const algorithm = options.algorithm || 'aes-256-cbc';
    const key = typeof options.key === 'string' ? Buffer.from(options.key, 'hex') : options.key;
    const iv = options.iv || generateIV();

    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const result: { encrypted: string; iv: string; tag?: string } = {
      encrypted,
      iv: iv.toString('hex'),
    };

    // For GCM mode, include authentication tag
    if (algorithm.includes('gcm')) {
      result.tag = (cipher as crypto.CipherGCM).getAuthTag().toString('hex');
    }

    logger.info({ length: encrypted.length }, 'Data encrypted with AES');

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to encrypt with AES');
    throw new Error(
      `Failed to encrypt with AES: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decrypt data with AES
 */
export function decryptAES(
  encrypted: string,
  iv: string,
  options: AESEncryptionOptions & { tag?: string }
): string {
  logger.info({ algorithm: options.algorithm }, 'Decrypting with AES');

  try {
    const algorithm = options.algorithm || 'aes-256-cbc';
    const key = typeof options.key === 'string' ? Buffer.from(options.key, 'hex') : options.key;
    const ivBuffer = Buffer.from(iv, 'hex');

    const decipher = crypto.createDecipheriv(algorithm, key, ivBuffer);

    // For GCM mode, set authentication tag
    if (algorithm.includes('gcm') && options.tag) {
      (decipher as crypto.DecipherGCM).setAuthTag(Buffer.from(options.tag, 'hex'));
    }

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    logger.info('Data decrypted with AES');

    return decrypted;
  } catch (error) {
    logger.error({ error }, 'Failed to decrypt with AES');
    throw new Error(
      `Failed to decrypt with AES: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generate RSA key pair
 */
export function generateRSAKeyPair(modulusLength: 2048 | 4096 = 2048): RSAKeyPair {
  logger.info({ modulusLength }, 'Generating RSA key pair');

  try {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    logger.info({ modulusLength }, 'RSA key pair generated');

    return { publicKey, privateKey };
  } catch (error) {
    logger.error({ error }, 'Failed to generate RSA key pair');
    throw new Error(
      `Failed to generate RSA key pair: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Encrypt with RSA public key
 */
export function encryptRSA(data: string, publicKey: string): string {
  logger.info('Encrypting with RSA');

  try {
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(data)
    );

    const encryptedHex = encrypted.toString('base64');

    logger.info({ length: encryptedHex.length }, 'Data encrypted with RSA');

    return encryptedHex;
  } catch (error) {
    logger.error({ error }, 'Failed to encrypt with RSA');
    throw new Error(
      `Failed to encrypt with RSA: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decrypt with RSA private key
 */
export function decryptRSA(encrypted: string, privateKey: string): string {
  logger.info('Decrypting with RSA');

  try {
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(encrypted, 'base64')
    );

    const decryptedString = decrypted.toString('utf8');

    logger.info('Data decrypted with RSA');

    return decryptedString;
  } catch (error) {
    logger.error({ error }, 'Failed to decrypt with RSA');
    throw new Error(
      `Failed to decrypt with RSA: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Hash data with SHA-256
 */
export function hashSHA256(data: string): string {
  logger.info('Hashing with SHA-256');

  const hash = crypto.createHash('sha256').update(data).digest('hex');

  logger.info({ hashLength: hash.length }, 'Data hashed with SHA-256');

  return hash;
}

/**
 * Hash data with SHA-512
 */
export function hashSHA512(data: string): string {
  logger.info('Hashing with SHA-512');

  const hash = crypto.createHash('sha512').update(data).digest('hex');

  logger.info({ hashLength: hash.length }, 'Data hashed with SHA-512');

  return hash;
}

/**
 * Hash data with MD5 (not secure, for checksums only)
 */
export function hashMD5(data: string): string {
  logger.info('Hashing with MD5');

  const hash = crypto.createHash('md5').update(data).digest('hex');

  logger.info({ hashLength: hash.length }, 'Data hashed with MD5');

  return hash;
}

/**
 * Generate HMAC signature
 */
export function generateHMAC(
  data: string,
  secret: string,
  algorithm: 'sha256' | 'sha512' | 'sha1' = 'sha256'
): string {
  logger.info({ algorithm }, 'Generating HMAC');

  const hmac = crypto.createHmac(algorithm, secret).update(data).digest('hex');

  logger.info({ hmacLength: hmac.length }, 'HMAC generated');

  return hmac;
}

/**
 * Verify HMAC signature
 */
export function verifyHMAC(
  data: string,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha512' | 'sha1' = 'sha256'
): boolean {
  logger.info({ algorithm }, 'Verifying HMAC');

  const expectedHmac = generateHMAC(data, secret, algorithm);

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedHmac)
    );

    logger.info({ isValid }, 'HMAC verification completed');

    return isValid;
  } catch {
    logger.warn('HMAC verification failed - length mismatch');
    return false;
  }
}

/**
 * Generate random string
 */
export function generateRandomString(
  length: number,
  charset: 'alphanumeric' | 'alphabetic' | 'numeric' | 'hex' | 'base64' = 'alphanumeric'
): string {
  logger.info({ length, charset }, 'Generating random string');

  if (charset === 'hex') {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  if (charset === 'base64') {
    return crypto.randomBytes(Math.ceil((length * 3) / 4)).toString('base64').slice(0, length);
  }

  const charsets = {
    alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    alphabetic: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    numeric: '0123456789',
  };

  const chars = charsets[charset];
  let result = '';

  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }

  logger.info({ length, charset }, 'Random string generated');

  return result;
}

/**
 * Generate UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generate secure random token
 */
export function generateToken(bytes: number = 32): string {
  logger.info({ bytes }, 'Generating secure token');

  const token = crypto.randomBytes(bytes).toString('base64url');

  logger.info({ tokenLength: token.length }, 'Secure token generated');

  return token;
}

/**
 * Hash password with PBKDF2
 */
export function hashPassword(
  password: string,
  salt?: string,
  iterations: number = 100000
): { hash: string; salt: string } {
  logger.info({ iterations }, 'Hashing password with PBKDF2');

  try {
    const passwordSalt = salt || crypto.randomBytes(16).toString('hex');

    const hash = crypto
      .pbkdf2Sync(password, passwordSalt, iterations, 64, 'sha512')
      .toString('hex');

    logger.info('Password hashed with PBKDF2');

    return { hash, salt: passwordSalt };
  } catch (error) {
    logger.error({ error }, 'Failed to hash password');
    throw new Error(
      `Failed to hash password: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Verify password hash
 */
export function verifyPassword(
  password: string,
  hash: string,
  salt: string,
  iterations: number = 100000
): boolean {
  logger.info('Verifying password');

  try {
    const computedHash = hashPassword(password, salt, iterations).hash;

    const isValid = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computedHash));

    logger.info({ isValid }, 'Password verification completed');

    return isValid;
  } catch (error) {
    logger.error({ error }, 'Failed to verify password');
    return false;
  }
}

/**
 * Generate salt for password hashing
 */
export function generateSalt(bytes: number = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Constant-time string comparison (prevent timing attacks)
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Encode to base64
 */
export function encodeBase64(data: string): string {
  return Buffer.from(data).toString('base64');
}

/**
 * Decode from base64
 */
export function decodeBase64(data: string): string {
  return Buffer.from(data, 'base64').toString('utf8');
}

/**
 * Encode to base64url (URL-safe)
 */
export function encodeBase64Url(data: string): string {
  return Buffer.from(data).toString('base64url');
}

/**
 * Decode from base64url
 */
export function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}

/**
 * Generate checksum for data
 */
export function generateChecksum(data: string, algorithm: 'sha256' | 'md5' = 'sha256'): string {
  logger.info({ algorithm }, 'Generating checksum');

  const hash = crypto.createHash(algorithm).update(data).digest('hex');

  logger.info({ checksum: hash }, 'Checksum generated');

  return hash;
}

/**
 * Verify checksum
 */
export function verifyChecksum(
  data: string,
  checksum: string,
  algorithm: 'sha256' | 'md5' = 'sha256'
): boolean {
  logger.info({ algorithm }, 'Verifying checksum');

  const computed = generateChecksum(data, algorithm);
  const isValid = secureCompare(computed, checksum);

  logger.info({ isValid }, 'Checksum verification completed');

  return isValid;
}

/**
 * Sign data with private key
 */
export function signData(data: string, privateKey: string): string {
  logger.info('Signing data');

  try {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(data);
    sign.end();

    const signature = sign.sign(privateKey, 'base64');

    logger.info({ signatureLength: signature.length }, 'Data signed');

    return signature;
  } catch (error) {
    logger.error({ error }, 'Failed to sign data');
    throw new Error(
      `Failed to sign data: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Verify signature with public key
 */
export function verifySignature(data: string, signature: string, publicKey: string): boolean {
  logger.info('Verifying signature');

  try {
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(data);
    verify.end();

    const isValid = verify.verify(publicKey, signature, 'base64');

    logger.info({ isValid }, 'Signature verification completed');

    return isValid;
  } catch (error) {
    logger.error({ error }, 'Failed to verify signature');
    return false;
  }
}
