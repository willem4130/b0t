import { beforeAll, afterEach, afterAll, vi } from 'vitest';

// Mock environment variables
beforeAll(() => {
  // Set test environment variables
  process.env.AUTH_SECRET = 'test-secret-key-for-encryption-minimum-32-chars-long';
  process.env.DATABASE_URL = ''; // Use SQLite for tests

  // Mock logger to prevent console spam in tests
  vi.mock('@/lib/logger', () => ({
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    logJobStart: vi.fn(),
    logJobComplete: vi.fn(),
    logJobError: vi.fn(),
  }));
});

// Cleanup runs after each test
afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks();
});

// Cleanup runs after all tests
afterAll(() => {
  // Restore all mocks
  vi.restoreAllMocks();
});
