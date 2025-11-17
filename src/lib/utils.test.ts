import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names', () => {
      const result = cn('class1', 'class2');
      expect(result).toBe('class1 class2');
    });

    it('should handle conditional classes', () => {
      const result = cn('class1', false && 'class2', 'class3');
      expect(result).toBe('class1 class3');
    });

    it('should merge Tailwind classes correctly', () => {
      const result = cn('p-4', 'p-2');
      // twMerge should keep only the last p-* class
      expect(result).toBe('p-2');
    });

    it('should handle arrays of classes', () => {
      const result = cn(['class1', 'class2'], 'class3');
      expect(result).toBe('class1 class2 class3');
    });

    it('should handle objects with conditional classes', () => {
      const result = cn({
        'class1': true,
        'class2': false,
        'class3': true,
      });
      expect(result).toBe('class1 class3');
    });

    it('should handle empty input', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('should handle null and undefined', () => {
      const result = cn('class1', null, undefined, 'class2');
      expect(result).toBe('class1 class2');
    });

    it('should merge conflicting Tailwind classes', () => {
      const result = cn('bg-red-500', 'bg-blue-500');
      expect(result).toBe('bg-blue-500');
    });

    it('should handle complex Tailwind merging', () => {
      const result = cn(
        'px-2 py-1',
        'px-4', // Should override px-2
        'py-2'  // Should override py-1
      );
      expect(result).toBe('px-4 py-2');
    });

    it('should work with real component example', () => {
      const base = 'rounded-lg border p-4';
      const variant = 'bg-blue-500 text-white';
      const result = cn(base, variant);
      expect(result).toContain('rounded-lg');
      expect(result).toContain('border');
      expect(result).toContain('p-4');
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('text-white');
    });
  });
});
