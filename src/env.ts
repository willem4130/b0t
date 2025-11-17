import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  /**
   * Server-side environment variables
   * These are only available on the server and won't be exposed to the client
   */
  server: {
    // Database
    DATABASE_URL: z.string().optional(),

    // Redis
    REDIS_URL: z.string().optional(),

    // NextAuth
    AUTH_SECRET: z.string().min(1),
    ENCRYPTION_KEY: z.string().optional(),
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().optional(),

    // Node
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  },

  /**
   * Client-side environment variables
   * These are exposed to the browser (must start with NEXT_PUBLIC_)
   */
  client: {
    // Add client-side env vars here if needed
    // NEXT_PUBLIC_API_URL: z.string().url(),
  },

  /**
   * Runtime environment variables
   * You can destructure these from `process.env`
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    NODE_ENV: process.env.NODE_ENV,
  },

  /**
   * Skip validation during build (optional)
   * Set to true to skip validation during build time
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Extend the default error messages
   */
  emptyStringAsUndefined: true,
});
