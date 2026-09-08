/**
 * Shared PWA Install hook
 * Singleton pattern: global event listeners + useSyncExternalStore
 */

import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream
  );
}

// ──── Shared PWA Install State (singleton) ────
let _deferredPrompt: BeforeInstallPromptEvent | null = null;
let _installed = false;
let _isIOS = false;
const _listeners = new Set<() => void>();

// Cached snapshot — must return the same reference when values haven't changed
// (useSyncExternalStore compares with Object.is)
let _cachedSnapshot: {
  deferredPrompt: BeforeInstallPromptEvent | null;
  installed: boolean;
  isIOSDevice: boolean;
} = {
  deferredPrompt: _deferredPrompt,
  installed: _installed,
  isIOSDevice: _isIOS,
};

function notify() {
  // Rebuild cached snapshot before notifying subscribers
  _cachedSnapshot = { deferredPrompt: _deferredPrompt, installed: _installed, isIOSDevice: _isIOS };
  _listeners.forEach((fn) => {
    fn();
  });
}

function subscribe(fn: () => void) {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

function getSnapshot() {
  return _cachedSnapshot;
}

// Initialize global listeners once
if (typeof window !== 'undefined') {
  _isIOS = isIOS();
  // Rebuild snapshot with correct _isIOS value
  _cachedSnapshot = { deferredPrompt: _deferredPrompt, installed: _installed, isIOSDevice: _isIOS };

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    _deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    _installed = true;
    _deferredPrompt = null;
    localStorage.setItem('pwa-installed', 'true');
    notify();
  });
}

/** Reusable hook for PWA install across components */
export function usePWAInstall() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const canInstall = !!state.deferredPrompt && !state.installed && !isStandalone();
  const isIOSDevice = state.isIOSDevice && !isStandalone();
  const isInstalled = state.installed || isStandalone();

  const install = async () => {
    const prompt = _deferredPrompt;
    if (!prompt) return false;
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      // eslint-disable-next-line react-compiler/react-compiler -- module-level singleton for useSyncExternalStore
      _deferredPrompt = null;
      notify();
      return outcome === 'accepted';
    } catch {
      return false;
    }
  };

  return { canInstall, isIOSDevice, isInstalled, install };
}
