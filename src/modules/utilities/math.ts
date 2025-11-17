/**
 * Math Utilities Module
 *
 * Common mathematical operations for workflows
 * - Basic arithmetic (add, subtract, multiply, divide)
 * - Rounding and precision control
 * - Number utilities (abs, clamp, percentage)
 * - Statistical operations (built on aggregation module)
 *
 * Perfect for:
 * - Calculations in workflows
 * - Data transformations
 * - Price calculations
 * - Scoring systems
 */

/**
 * Add two numbers
 * @param a - First number
 * @param b - Second number
 * @returns Sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Subtract two numbers
 * @param a - First number
 * @param b - Number to subtract
 * @returns Difference of a and b
 */
export function subtract(a: number, b: number): number {
  return a - b;
}

/**
 * Multiply two numbers
 * @param a - First number
 * @param b - Second number
 * @returns Product of a and b
 */
export function multiply(a: number, b: number): number {
  return a * b;
}

/**
 * Divide two numbers
 * @param a - Dividend
 * @param b - Divisor
 * @returns Quotient of a divided by b
 * @throws Error if divisor is zero
 */
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero is not allowed');
  }
  return a / b;
}

/**
 * Round a number to specified decimal places
 * @param value - Number to round
 * @param decimals - Number of decimal places (default: 0)
 * @returns Rounded number
 */
export function round(value: number, decimals: number = 0): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Round a number down to the nearest integer
 * @param value - Number to floor
 * @returns Floored number
 */
export function floor(value: number): number {
  return Math.floor(value);
}

/**
 * Round a number up to the nearest integer
 * @param value - Number to ceil
 * @returns Ceiled number
 */
export function ceil(value: number): number {
  return Math.ceil(value);
}

/**
 * Get the absolute value of a number
 * @param value - Number to get absolute value of
 * @returns Absolute value
 */
export function abs(value: number): number {
  return Math.abs(value);
}

/**
 * Calculate percentage
 * @param value - Part value
 * @param total - Total value
 * @returns Percentage (0-100)
 */
export function percentage(value: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return (value / total) * 100;
}

/**
 * Clamp a number between min and max values
 * @param value - Number to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped number
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Get the maximum of two or more numbers
 * @param numbers - Numbers to compare
 * @returns Maximum value
 */
export function max(...numbers: number[]): number {
  return Math.max(...numbers);
}

/**
 * Get the minimum of two or more numbers
 * @param numbers - Numbers to compare
 * @returns Minimum value
 */
export function min(...numbers: number[]): number {
  return Math.min(...numbers);
}

/**
 * Calculate power (a to the power of b)
 * @param base - Base number
 * @param exponent - Exponent
 * @returns Result of base^exponent
 */
export function power(base: number, exponent: number): number {
  return Math.pow(base, exponent);
}

/**
 * Calculate square root
 * @param value - Number to get square root of
 * @returns Square root
 */
export function sqrt(value: number): number {
  if (value < 0) {
    throw new Error('Cannot calculate square root of negative number');
  }
  return Math.sqrt(value);
}

/**
 * Calculate modulo (remainder after division)
 * @param a - Dividend
 * @param b - Divisor
 * @returns Remainder
 */
export function modulo(a: number, b: number): number {
  return a % b;
}

/**
 * Check if a number is even
 * @param value - Number to check
 * @returns True if even, false otherwise
 */
export function isEven(value: number): boolean {
  return value % 2 === 0;
}

/**
 * Check if a number is odd
 * @param value - Number to check
 * @returns True if odd, false otherwise
 */
export function isOdd(value: number): boolean {
  return value % 2 !== 0;
}

/**
 * Convert degrees to radians
 * @param degrees - Angle in degrees
 * @returns Angle in radians
 */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Convert radians to degrees
 * @param radians - Angle in radians
 * @returns Angle in degrees
 */
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Generate a random number between min and max (inclusive)
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Random number
 */
export function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Generate a random integer between min and max (inclusive)
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Random integer
 */
export function randomIntBetween(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
