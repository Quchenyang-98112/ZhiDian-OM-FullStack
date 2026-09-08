import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hapticClick,
  hapticModeChange,
  hapticSuccess,
  isHapticSupported,
  triggerHaptic,
} from '../lib/haptics';

describe('Haptic Feedback', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore vibrate to a vi.fn() (the setup.ts default)
    Object.defineProperty(navigator, 'vibrate', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('should check haptic support', () => {
    const supported = isHapticSupported();
    expect(typeof supported).toBe('boolean');
  });

  it('should not throw when triggering haptic on unsupported device', () => {
    Object.defineProperty(navigator, 'vibrate', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    expect(() => triggerHaptic('light')).not.toThrow();
    expect(() => hapticClick()).not.toThrow();
    expect(() => hapticSuccess()).not.toThrow();
  });

  it('should call vibrate when supported', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      writable: true,
      configurable: true,
    });

    triggerHaptic('medium');
    expect(vibrateMock).toHaveBeenCalled();
  });

  it('covers remaining patterns and swallows vibrate errors', () => {
    const vibrateMock = vi.fn().mockImplementation(() => {
      throw new Error('blocked');
    });
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      writable: true,
      configurable: true,
    });

    expect(() => triggerHaptic('heavy')).not.toThrow();
    expect(() => triggerHaptic('warning')).not.toThrow();
    expect(() => triggerHaptic('error')).not.toThrow();
    expect(() => hapticModeChange()).not.toThrow();
  });
});
