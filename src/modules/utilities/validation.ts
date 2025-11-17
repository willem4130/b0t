import { createCircuitBreaker } from '@/lib/resilience';
import { logger } from '@/lib/logger';
import { isEmail, isUrl } from './string-utils';

/**
 * Validation Utilities Module
 *
 * Comprehensive validation functions for workflows
 * - Required field validation
 * - Type checking
 * - Range and length validation
 * - Pattern matching
 * - Email and URL validation
 * - Combined rule validation
 *
 * Perfect for:
 * - Validating user input
 * - Checking API responses
 * - Ensuring data quality
 * - Form validation in workflows
 */

/**
 * Validation error
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public rule?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    field?: string;
    rule: string;
    message: string;
  }>;
}

/**
 * Type map for validateTypes
 */
export type TypeMap = Record<
  string,
  'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'undefined'
>;

/**
 * Validation rule
 */
export interface ValidationRule {
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp | string;
  email?: boolean;
  url?: boolean;
  custom?: (value: unknown) => boolean;
  customMessage?: string;
}

/**
 * Rules map for isValid
 */
export type RulesMap = Record<string, ValidationRule>;

/**
 * Check if required fields exist in data
 * @param data - Object to validate
 * @param fields - Array of required field names
 * @returns Object with validation result
 * @example
 * validateRequired({ name: 'John', email: 'john@example.com' }, ['name', 'email'])
 * // => { valid: true, errors: [] }
 */
async function validateRequiredInternal(
  data: Record<string, unknown>,
  fields: string[]
): Promise<ValidationResult> {
  logger.info(
    { fieldCount: fields.length, dataKeys: Object.keys(data) },
    'Validating required fields'
  );

  const errors: ValidationResult['errors'] = [];

  for (const field of fields) {
    const value = data[field];
    if (value === undefined || value === null || value === '') {
      errors.push({
        field,
        rule: 'required',
        message: `Field '${field}' is required`,
      });
    }
  }

  const valid = errors.length === 0;

  logger.info(
    { valid, errorCount: errors.length },
    'Required field validation complete'
  );

  return { valid, errors };
}

const validateRequiredWithBreaker = createCircuitBreaker(
  validateRequiredInternal,
  {
    timeout: 5000,
    name: 'validate-required',
  }
);

export async function validateRequired(
  data: Record<string, unknown>,
  fields: string[]
): Promise<ValidationResult> {
  return validateRequiredWithBreaker.fire(data, fields);
}

/**
 * Check if field types match expected types
 * @param data - Object to validate
 * @param typeMap - Map of field names to expected types
 * @returns Object with validation result
 * @example
 * validateTypes({ name: 'John', age: 30 }, { name: 'string', age: 'number' })
 * // => { valid: true, errors: [] }
 */
async function validateTypesInternal(
  data: Record<string, unknown>,
  typeMap: TypeMap
): Promise<ValidationResult> {
  logger.info(
    { fieldCount: Object.keys(typeMap).length },
    'Validating field types'
  );

  const errors: ValidationResult['errors'] = [];

  for (const [field, expectedType] of Object.entries(typeMap)) {
    const value = data[field];
    let actualType: string;

    if (value === null) {
      actualType = 'null';
    } else if (Array.isArray(value)) {
      actualType = 'array';
    } else {
      actualType = typeof value;
    }

    if (actualType !== expectedType) {
      errors.push({
        field,
        rule: 'type',
        message: `Field '${field}' must be of type '${expectedType}', got '${actualType}'`,
      });
    }
  }

  const valid = errors.length === 0;

  logger.info({ valid, errorCount: errors.length }, 'Type validation complete');

  return { valid, errors };
}

const validateTypesWithBreaker = createCircuitBreaker(validateTypesInternal, {
  timeout: 5000,
  name: 'validate-types',
});

export async function validateTypes(
  data: Record<string, unknown>,
  typeMap: TypeMap
): Promise<ValidationResult> {
  return validateTypesWithBreaker.fire(data, typeMap);
}

/**
 * Validate string or array length
 * @param value - String or array to validate
 * @param min - Minimum length (inclusive)
 * @param max - Maximum length (inclusive)
 * @returns Object with validation result
 * @example
 * validateLength('hello', 1, 10) // => { valid: true, errors: [] }
 * validateLength([1, 2, 3], 2, 5) // => { valid: true, errors: [] }
 */
async function validateLengthInternal(
  value: string | unknown[],
  min?: number,
  max?: number
): Promise<ValidationResult> {
  logger.info(
    { valueType: Array.isArray(value) ? 'array' : 'string', min, max },
    'Validating length'
  );

  const errors: ValidationResult['errors'] = [];
  const length = value.length;

  if (min !== undefined && length < min) {
    errors.push({
      rule: 'minLength',
      message: `Length must be at least ${min}, got ${length}`,
    });
  }

  if (max !== undefined && length > max) {
    errors.push({
      rule: 'maxLength',
      message: `Length must be at most ${max}, got ${length}`,
    });
  }

  const valid = errors.length === 0;

  logger.info({ valid, length, errorCount: errors.length }, 'Length validation complete');

  return { valid, errors };
}

const validateLengthWithBreaker = createCircuitBreaker(validateLengthInternal, {
  timeout: 5000,
  name: 'validate-length',
});

export async function validateLength(
  value: string | unknown[],
  min?: number,
  max?: number
): Promise<ValidationResult> {
  return validateLengthWithBreaker.fire(value, min, max);
}

/**
 * Validate number range
 * @param value - Number to validate
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns Object with validation result
 * @example
 * validateRange(5, 1, 10) // => { valid: true, errors: [] }
 * validateRange(15, 1, 10) // => { valid: false, errors: [...] }
 */
async function validateRangeInternal(
  value: number,
  min?: number,
  max?: number
): Promise<ValidationResult> {
  logger.info({ value, min, max }, 'Validating range');

  const errors: ValidationResult['errors'] = [];

  if (typeof value !== 'number' || isNaN(value)) {
    errors.push({
      rule: 'type',
      message: `Value must be a number, got ${typeof value}`,
    });
    return { valid: false, errors };
  }

  if (min !== undefined && value < min) {
    errors.push({
      rule: 'min',
      message: `Value must be at least ${min}, got ${value}`,
    });
  }

  if (max !== undefined && value > max) {
    errors.push({
      rule: 'max',
      message: `Value must be at most ${max}, got ${value}`,
    });
  }

  const valid = errors.length === 0;

  logger.info({ valid, errorCount: errors.length }, 'Range validation complete');

  return { valid, errors };
}

const validateRangeWithBreaker = createCircuitBreaker(validateRangeInternal, {
  timeout: 5000,
  name: 'validate-range',
});

export async function validateRange(
  value: number,
  min?: number,
  max?: number
): Promise<ValidationResult> {
  return validateRangeWithBreaker.fire(value, min, max);
}

/**
 * Validate value against regex pattern
 * @param value - String to validate
 * @param pattern - Regex pattern (string or RegExp)
 * @returns Object with validation result
 * @example
 * validatePattern('abc123', /^[a-z0-9]+$/) // => { valid: true, errors: [] }
 * validatePattern('ABC', '^[a-z]+$') // => { valid: false, errors: [...] }
 */
async function validatePatternInternal(
  value: string,
  pattern: string | RegExp
): Promise<ValidationResult> {
  logger.info(
    { valueLength: value.length, pattern: pattern.toString() },
    'Validating pattern'
  );

  const errors: ValidationResult['errors'] = [];

  if (typeof value !== 'string') {
    errors.push({
      rule: 'type',
      message: `Value must be a string, got ${typeof value}`,
    });
    return { valid: false, errors };
  }

  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

  if (!regex.test(value)) {
    errors.push({
      rule: 'pattern',
      message: `Value does not match pattern ${pattern.toString()}`,
    });
  }

  const valid = errors.length === 0;

  logger.info({ valid, errorCount: errors.length }, 'Pattern validation complete');

  return { valid, errors };
}

const validatePatternWithBreaker = createCircuitBreaker(
  validatePatternInternal,
  {
    timeout: 5000,
    name: 'validate-pattern',
  }
);

export async function validatePattern(
  value: string,
  pattern: string | RegExp
): Promise<ValidationResult> {
  return validatePatternWithBreaker.fire(value, pattern);
}

/**
 * Validate email address
 * Uses the isEmail function from string-utils
 * @param email - Email address to validate
 * @returns Object with validation result
 * @example
 * validateEmail('user@example.com') // => { valid: true, errors: [] }
 * validateEmail('invalid-email') // => { valid: false, errors: [...] }
 */
async function validateEmailInternal(email: string): Promise<ValidationResult> {
  logger.info({ emailLength: email.length }, 'Validating email');

  const errors: ValidationResult['errors'] = [];

  if (typeof email !== 'string') {
    errors.push({
      rule: 'type',
      message: `Email must be a string, got ${typeof email}`,
    });
    return { valid: false, errors };
  }

  if (!isEmail(email)) {
    errors.push({
      rule: 'email',
      message: `Invalid email address: ${email}`,
    });
  }

  const valid = errors.length === 0;

  logger.info({ valid, errorCount: errors.length }, 'Email validation complete');

  return { valid, errors };
}

const validateEmailWithBreaker = createCircuitBreaker(validateEmailInternal, {
  timeout: 5000,
  name: 'validate-email',
});

export async function validateEmail(email: string): Promise<ValidationResult> {
  return validateEmailWithBreaker.fire(email);
}

/**
 * Validate URL
 * Uses the isUrl function from string-utils
 * @param url - URL to validate
 * @returns Object with validation result
 * @example
 * validateUrl('https://example.com') // => { valid: true, errors: [] }
 * validateUrl('not-a-url') // => { valid: false, errors: [...] }
 */
async function validateUrlInternal(url: string): Promise<ValidationResult> {
  logger.info({ urlLength: url.length }, 'Validating URL');

  const errors: ValidationResult['errors'] = [];

  if (typeof url !== 'string') {
    errors.push({
      rule: 'type',
      message: `URL must be a string, got ${typeof url}`,
    });
    return { valid: false, errors };
  }

  if (!isUrl(url)) {
    errors.push({
      rule: 'url',
      message: `Invalid URL: ${url}`,
    });
  }

  const valid = errors.length === 0;

  logger.info({ valid, errorCount: errors.length }, 'URL validation complete');

  return { valid, errors };
}

const validateUrlWithBreaker = createCircuitBreaker(validateUrlInternal, {
  timeout: 5000,
  name: 'validate-url',
});

export async function validateUrl(url: string): Promise<ValidationResult> {
  return validateUrlWithBreaker.fire(url);
}

/**
 * Validate data against multiple rules
 * Combines all validation types into a single function
 * @param data - Object to validate
 * @param rules - Map of field names to validation rules
 * @returns Object with validation result
 * @example
 * isValid(
 *   { name: 'John', email: 'john@example.com', age: 30 },
 *   {
 *     name: { type: 'string', required: true, minLength: 2 },
 *     email: { type: 'string', required: true, email: true },
 *     age: { type: 'number', min: 18, max: 120 }
 *   }
 * )
 * // => { valid: true, errors: [] }
 */
async function isValidInternal(
  data: Record<string, unknown>,
  rules: RulesMap
): Promise<ValidationResult> {
  logger.info(
    { fieldCount: Object.keys(rules).length },
    'Validating data with multiple rules'
  );

  const errors: ValidationResult['errors'] = [];

  for (const [field, rule] of Object.entries(rules)) {
    const value = data[field];

    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field,
        rule: 'required',
        message: `Field '${field}' is required`,
      });
      continue; // Skip other validations if required check fails
    }

    // Skip remaining validations if value is not provided and not required
    if (!rule.required && (value === undefined || value === null)) {
      continue;
    }

    // Check type
    if (rule.type) {
      let actualType: string;
      if (value === null) {
        actualType = 'null';
      } else if (Array.isArray(value)) {
        actualType = 'array';
      } else {
        actualType = typeof value;
      }

      if (actualType !== rule.type) {
        errors.push({
          field,
          rule: 'type',
          message: `Field '${field}' must be of type '${rule.type}', got '${actualType}'`,
        });
        continue;
      }
    }

    // Check min/max for numbers
    if (rule.type === 'number' && typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        errors.push({
          field,
          rule: 'min',
          message: `Field '${field}' must be at least ${rule.min}, got ${value}`,
        });
      }
      if (rule.max !== undefined && value > rule.max) {
        errors.push({
          field,
          rule: 'max',
          message: `Field '${field}' must be at most ${rule.max}, got ${value}`,
        });
      }
    }

    // Check minLength/maxLength for strings and arrays
    if (
      (rule.type === 'string' || rule.type === 'array') &&
      (typeof value === 'string' || Array.isArray(value))
    ) {
      const length = value.length;
      if (rule.minLength !== undefined && length < rule.minLength) {
        errors.push({
          field,
          rule: 'minLength',
          message: `Field '${field}' must have at least ${rule.minLength} characters/items, got ${length}`,
        });
      }
      if (rule.maxLength !== undefined && length > rule.maxLength) {
        errors.push({
          field,
          rule: 'maxLength',
          message: `Field '${field}' must have at most ${rule.maxLength} characters/items, got ${length}`,
        });
      }
    }

    // Check pattern for strings
    if (rule.pattern && typeof value === 'string') {
      const regex = typeof rule.pattern === 'string' ? new RegExp(rule.pattern) : rule.pattern;
      if (!regex.test(value)) {
        errors.push({
          field,
          rule: 'pattern',
          message: `Field '${field}' does not match pattern ${rule.pattern.toString()}`,
        });
      }
    }

    // Check email
    if (rule.email && typeof value === 'string') {
      if (!isEmail(value)) {
        errors.push({
          field,
          rule: 'email',
          message: `Field '${field}' must be a valid email address`,
        });
      }
    }

    // Check URL
    if (rule.url && typeof value === 'string') {
      if (!isUrl(value)) {
        errors.push({
          field,
          rule: 'url',
          message: `Field '${field}' must be a valid URL`,
        });
      }
    }

    // Check custom validation
    if (rule.custom) {
      try {
        if (!rule.custom(value)) {
          errors.push({
            field,
            rule: 'custom',
            message: rule.customMessage || `Field '${field}' failed custom validation`,
          });
        }
      } catch (error) {
        errors.push({
          field,
          rule: 'custom',
          message: `Custom validation error for field '${field}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  }

  const valid = errors.length === 0;

  logger.info(
    { valid, errorCount: errors.length },
    'Multi-rule validation complete'
  );

  return { valid, errors };
}

const isValidWithBreaker = createCircuitBreaker(isValidInternal, {
  timeout: 10000,
  name: 'is-valid',
});

export async function isValid(
  data: Record<string, unknown>,
  rules: RulesMap
): Promise<ValidationResult> {
  return isValidWithBreaker.fire(data, rules);
}
