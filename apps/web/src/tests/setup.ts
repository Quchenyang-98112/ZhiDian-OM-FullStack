import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Web Speech API
(globalThis as Record<string, unknown>).SpeechRecognition = vi.fn();
(globalThis as Record<string, unknown>).webkitSpeechRecognition = vi.fn();

// Mock Navigator Vibrate
Object.defineProperty(global.navigator, 'vibrate', {
  writable: true,
  configurable: true,
  value: vi.fn(),
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
