/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Set to 'true' in CI E2E jobs to expose the Zustand store on window.__NEXUS_STORE__ */
  readonly VITE_E2E_TESTING?: string;
  /** Build-time adapter mode — defaults to mock when unset */
  readonly VITE_ADAPTER_MODE?: string;
  /** Must be "true" together with VITE_ADAPTER_MODE=live to allow hardware connections */
  readonly VITE_ALLOW_LIVE_HARDWARE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Virtual modules from vite-plugin-pwa
declare module 'virtual:pwa-register/react' {
  import type { Dispatch, SetStateAction } from 'react';

  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: Error) => void;
  }

  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
    offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}

// Web Speech API
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudioend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

// eslint-disable-next-line no-var
declare var SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

// eslint-disable-next-line no-var
declare var webkitSpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

// Background Sync API
interface SyncManager {
  register(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

interface ServiceWorkerRegistration {
  sync: SyncManager;
}

// ── Optional Auth SDK modules (lazy-loaded when configured) ─────────

declare module '@supabase/supabase-js' {
  export function createClient(url: string, anonKey: string): unknown;
}

declare module 'keycloak-js' {
  export default class Keycloak {
    constructor(config: { url: string; realm: string; clientId: string });
    init(options: Record<string, unknown>): Promise<boolean>;
    login(options?: Record<string, unknown>): Promise<void>;
    logout(options?: Record<string, unknown>): Promise<void>;
    register(options?: Record<string, unknown>): Promise<void>;
    updateToken(minValidity: number): Promise<boolean>;
    token?: string;
    refreshToken?: string;
    tokenParsed?: Record<string, unknown>;
    authenticated?: boolean;
    subject?: string;
    onTokenExpired?: (() => void) | undefined;
    onAuthSuccess?: (() => void) | undefined;
    onAuthLogout?: (() => void) | undefined;
  }
}

// ── Capacitor (optional — only available in native mobile builds) ──

declare module '@capacitor/push-notifications' {
  export const PushNotifications: {
    requestPermissions(): Promise<{ receive: string }>;
    register(): Promise<void>;
    addListener(
      event: string,
      callback: (...args: never[]) => void,
    ): Promise<{ remove: () => void }>;
  };
}

declare module '@capacitor/local-notifications' {
  export const LocalNotifications: {
    schedule(options: { notifications: Array<Record<string, unknown>> }): Promise<void>;
    createChannel(channel: Record<string, unknown>): Promise<void>;
  };
}
