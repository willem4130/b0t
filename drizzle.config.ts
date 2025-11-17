import type { Config } from 'drizzle-kit';

// If DATABASE_URL is not set, use SQLite for local development
const databaseUrl = process.env.DATABASE_URL;
const useSQLite = !databaseUrl;

export default {
  schema: './src/lib/schema.ts',
  out: './drizzle',
  dialect: useSQLite ? 'sqlite' : 'postgresql',
  dbCredentials: useSQLite
    ? {
        url: 'data/local.db',
      }
    : {
        url: databaseUrl!,
      },
} satisfies Config;
