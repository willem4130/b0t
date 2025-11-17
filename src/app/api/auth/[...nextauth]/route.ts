import { handlers } from '@/lib/auth';

/**
 * NextAuth.js API Route Handler
 *
 * This handles all authentication requests:
 * - GET  /api/auth/signin
 * - POST /api/auth/signin/:provider
 * - GET  /api/auth/signout
 * - POST /api/auth/signout
 * - GET  /api/auth/callback/:provider
 * - POST /api/auth/callback/:provider
 * - GET  /api/auth/session
 * - GET  /api/auth/csrf
 * - GET  /api/auth/providers
 */

export const { GET, POST } = handlers;
