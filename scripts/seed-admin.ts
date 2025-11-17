#!/usr/bin/env tsx
/**
 * Seed Admin User Script
 *
 * Creates a default admin user and organization if they don't exist.
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   npm run db:seed (uses dotenv-cli to load .env.local)
 */

import bcrypt from 'bcryptjs';
import { db } from '../src/lib/db';
import { usersTable } from '../src/lib/schema';
import { eq } from 'drizzle-orm';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@b0t.dev';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const ADMIN_USER_ID = '1';

async function seedAdmin() {
  try {
    // Check if admin user already exists
    const existingUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, ADMIN_USER_ID))
      .limit(1);

    if (existingUser.length === 0) {
      // Create admin user
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

      await db.insert(usersTable).values({
        id: ADMIN_USER_ID,
        email: ADMIN_EMAIL,
        password: hashedPassword,
        name: 'Admin',
        emailVerified: 1,
      });

      console.log('✅ Admin user created');
    } else {
      console.log('✅ Admin user ready');
    }

    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed admin user:', error);
    process.exit(1);
  }
}

// Run the seed
seedAdmin();
