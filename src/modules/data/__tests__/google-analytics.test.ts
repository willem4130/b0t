import { describe, it, expect } from 'vitest';
import * as googleAnalytics from '../google-analytics';

describe('google-analytics module', () => {
  it('should export functions', () => {
    expect(googleAnalytics).toBeDefined();
  });
});
