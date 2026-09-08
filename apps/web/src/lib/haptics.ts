/**
 * Haptic Feedback Utilities
 * Provides tactile feedback for user interactions
 */

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const patterns: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: [10, 50, 10],
  warning: [20, 100, 20],
  error: [50, 100, 50, 100, 50],
};

/**
 * Triggers haptic feedback if supported by the device
 */
export function triggerHaptic(pattern: HapticPattern = 'light'): void {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(patterns[pattern]);
    } catch {
      // Haptic feedback not supported on this device
    }
  }
}

/**
 * Haptic feedback for button clicks
 */
export function hapticClick(): void {
  triggerHaptic('light');
}

/**
 * Haptic feedback for mode changes (SG Ready, EV charging)
 */
export function hapticModeChange(): void {
  triggerHaptic('medium');
}

/**
 * Haptic feedback for successful actions
 */
export function hapticSuccess(): void {
  triggerHaptic('success');
}

/**
 * Check if haptic feedback is supported
 */
export function isHapticSupported(): boolean {
  return 'vibrate' in navigator;
}
