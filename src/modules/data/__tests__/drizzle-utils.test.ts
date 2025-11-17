import { describe, it, expect } from 'vitest';
import * as drizzleUtils from '../drizzle-utils';

describe('drizzle-utils module', () => {
  it('should export functions', () => {
    expect(drizzleUtils).toBeDefined();
  });
});
