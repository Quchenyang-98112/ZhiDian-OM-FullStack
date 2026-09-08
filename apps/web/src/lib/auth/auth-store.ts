/**
 * Auth Store — Zustand store for authentication state
 *
 * Uses Zustand (no persist — tokens managed by providers).
 * The store holds the current session, loading state, and active provider.
 */

import { create } from 'zustand';

import type {
  AuthCredentials,
  AuthProvider,
  AuthProviderType,
  AuthSession,
  AuthUser,
  CreateShareLinkOptions,
  OAuthProvider,
  ShareLink,
} from './auth-provider';

// ─── Store State ────────────────────────────────────────────────────

interface AuthState {
  /** Active auth provider instance */
  provider: AuthProvider | null;
  /** Current provider type */
  providerType: AuthProviderType;
  /** Current session (null = not authenticated) */
  session: AuthSession | null;
  /** Whether auth is initializing */
  loading: boolean;
  /** Last auth error message */
  error: string | null;
  /** Share links created in this session */
  shareLinks: ShareLink[];

  // ── Actions ─────────────────────────────────────────────────

  /** Set the active auth provider and initialize it */
  setProvider: (provider: AuthProvider) => Promise<void>;
  /** Clear the provider (reset to unauthenticated) */
  clearProvider: () => void;

  /** Sign in */
  signIn: (credentials: AuthCredentials) => Promise<void>;
  /** Sign up */
  signUp: (credentials: AuthCredentials & { displayName?: string }) => Promise<void>;
  /** Sign out */
  signOut: () => Promise<void>;
  /** OAuth sign-in */
  signInWithOAuth: (oauthProvider: OAuthProvider) => Promise<void>;
  /** Magic link sign-in */
  signInWithMagicLink: (email: string) => Promise<void>;
  /** Refresh session */
  refreshSession: () => Promise<void>;

  /** Create share link */
  createShareLink: (options: CreateShareLinkOptions) => Promise<ShareLink>;
  /** Revoke share link */
  revokeShareLink: (linkId: string) => Promise<void>;
  /** Reload share links */
  loadShareLinks: () => Promise<void>;

  /** Clear error */
  clearError: () => void;
}

// ─── Store ──────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()((set, get) => ({
  provider: null,
  providerType: 'none',
  session: null,
  loading: false,
  error: null,
  shareLinks: [],

  setProvider: async (provider) => {
    // Clean up previous provider
    get().provider?.destroy();

    set({ provider, providerType: provider.type, loading: true, error: null });

    try {
      const session = await provider.initialize();
      set({ session, loading: false });

      // Subscribe to auth state changes
      provider.onAuthStateChange((newSession) => {
        set({ session: newSession });
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Initialization failed',
      });
    }
  },

  clearProvider: () => {
    get().provider?.destroy();
    set({
      provider: null,
      providerType: 'none',
      session: null,
      loading: false,
      error: null,
      shareLinks: [],
    });
  },

  signIn: async (credentials) => {
    const { provider } = get();
    if (!provider) throw new Error('No auth provider configured');

    set({ loading: true, error: null });
    try {
      const session = await provider.signIn(credentials);
      set({ session, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      set({ loading: false, error: message });
      throw err;
    }
  },

  signUp: async (credentials) => {
    const { provider } = get();
    if (!provider) throw new Error('No auth provider configured');

    set({ loading: true, error: null });
    try {
      const session = await provider.signUp(credentials);
      set({ session, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      set({ loading: false, error: message });
      throw err;
    }
  },

  signOut: async () => {
    const { provider } = get();
    if (!provider) return;

    set({ loading: true, error: null });
    try {
      await provider.signOut();
      set({ session: null, loading: false, shareLinks: [] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign out failed';
      set({ loading: false, error: message });
    }
  },

  signInWithOAuth: async (oauthProvider) => {
    const { provider } = get();
    if (!provider?.signInWithOAuth) throw new Error('OAuth not supported');

    set({ loading: true, error: null });
    try {
      await provider.signInWithOAuth(oauthProvider);
      // Session will be set via onAuthStateChange after redirect
      set({ loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OAuth sign in failed';
      set({ loading: false, error: message });
    }
  },

  signInWithMagicLink: async (email) => {
    const { provider } = get();
    if (!provider?.signInWithMagicLink) throw new Error('Magic link not supported');

    set({ loading: true, error: null });
    try {
      await provider.signInWithMagicLink(email);
      set({ loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Magic link failed';
      set({ loading: false, error: message });
    }
  },

  refreshSession: async () => {
    const { provider } = get();
    if (!provider) return;

    try {
      const session = await provider.refreshSession();
      set({ session });
    } catch {
      set({ session: null });
    }
  },

  createShareLink: async (options) => {
    const { provider } = get();
    if (!provider) throw new Error('No auth provider configured');

    const link = await provider.createShareLink(options);
    set((state) => ({ shareLinks: [...state.shareLinks, link] }));
    return link;
  },

  revokeShareLink: async (linkId) => {
    const { provider } = get();
    if (!provider) throw new Error('No auth provider configured');

    await provider.revokeShareLink(linkId);
    set((state) => ({
      shareLinks: state.shareLinks.filter((l) => l.id !== linkId),
    }));
  },

  loadShareLinks: async () => {
    const { provider } = get();
    if (!provider) return;

    try {
      const links = await provider.listShareLinks();
      set({ shareLinks: links });
    } catch {
      // Silently fail — share links are optional
    }
  },

  clearError: () => set({ error: null }),
}));

// ─── Convenience Selectors ──────────────────────────────────────────

/** Current authenticated user (or null) */
export const useAuthUser = (): AuthUser | null => useAuthStore((s) => s.session?.user ?? null);

/** Whether the user is authenticated */
export const useIsAuthenticated = (): boolean => useAuthStore((s) => s.session !== null);

/** Current user's role */
export const useUserRole = (): string => useAuthStore((s) => s.session?.user.role ?? 'viewer');
