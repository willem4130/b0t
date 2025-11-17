/**
 * Centralized gradient theme constants for b0t
 * Use these constants throughout the app for consistent gradient styling
 */

export const GRADIENTS = {
  // Primary/Logo gradient - Use for branding, primary CTAs
  primary: {
    bg: 'bg-gradient-to-br from-primary via-blue-500 to-primary',
    text: 'bg-gradient-to-br from-primary via-blue-500 to-primary bg-clip-text text-transparent',
    border: 'bg-gradient-to-r from-primary via-blue-500 to-primary',
  },

  // Success gradient - Use for successful operations, positive states
  success: {
    bg: 'bg-gradient-to-br from-green-500/30 via-emerald-500/20 to-green-600/30',
    bgSolid: 'bg-gradient-to-br from-green-400 to-emerald-500',
    text: 'bg-gradient-to-br from-green-500 via-emerald-500 to-green-500 bg-clip-text text-transparent',
    border: 'bg-gradient-to-r from-green-500 via-emerald-400 to-green-500',
  },

  // Error gradient - Use for failed operations, error states
  error: {
    bg: 'bg-gradient-to-br from-red-500/30 via-rose-500/20 to-red-600/30',
    bgSolid: 'bg-gradient-to-br from-red-400 to-rose-500',
    text: 'bg-gradient-to-br from-red-500 via-rose-500 to-red-500 bg-clip-text text-transparent',
    border: 'bg-gradient-to-r from-red-500 via-rose-400 to-red-500',
  },

  // Active/Running gradient - Use for active states, running operations
  active: {
    bg: 'bg-gradient-to-br from-blue-500/30 via-cyan-500/20 to-blue-600/30',
    bgSolid: 'bg-gradient-to-br from-blue-400 to-cyan-500',
    text: 'bg-gradient-to-br from-blue-500 via-cyan-500 to-blue-500 bg-clip-text text-transparent',
    border: 'bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500',
  },

  // Warning gradient - Use for warning states, pending actions
  warning: {
    bg: 'bg-gradient-to-br from-amber-500/30 via-yellow-500/20 to-amber-600/30',
    bgSolid: 'bg-gradient-to-br from-amber-400 to-yellow-500',
    text: 'bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-500 bg-clip-text text-transparent',
    border: 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500',
  },
} as const;

/**
 * Helper function to get gradient classes by type and variant
 * @param type - The gradient type (primary, success, error, active, warning)
 * @param variant - The variant (bg, bgSolid, text, border)
 * @returns The gradient class string
 */
export function getGradient(
  type: keyof typeof GRADIENTS,
  variant: 'bg' | 'bgSolid' | 'text' | 'border' = 'bg'
): string {
  const gradientType = GRADIENTS[type];
  // Type assertion needed because primary doesn't have bgSolid
  if (variant in gradientType) {
    return gradientType[variant as keyof typeof gradientType];
  }
  return '';
}
