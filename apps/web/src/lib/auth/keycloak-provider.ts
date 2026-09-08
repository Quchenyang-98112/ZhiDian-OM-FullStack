/**
 * Keycloak Auth Provider — Self-Hosted OpenID Connect Authentication
 *
 * Uses Keycloak (or any OIDC-compliant IdP) for:
 *   - Authorization Code Flow + PKCE (browser-safe, no client secret)
 *   - Social login (Google, GitHub, Apple, Microsoft) via identity brokering
 *   - Fine-grained RBAC via Keycloak realm roles
 *   - Multi-tenant household management via Keycloak groups
 *   - Silent renew via iframe or refresh token
 *
 * Configuration:
 *   Store Keycloak URL, realm and clientId in the encrypted Dexie vault.
 *
 * Setup:
 *   1. Deploy Keycloak ≥22 (Docker or bare-metal)
 *   2. Create realm "hems" → client "hems-dashboard" (public, PKCE)
 *   3. Create realm roles: viewer, operator, admin, owner
 *   4. Add users and assign roles
 *   5. Enter Keycloak URL + realm + clientId in Settings → Auth → Keycloak
 */

import type {
  AuthCredentials,
  AuthProvider,
  AuthProviderType,
  AuthSession,
  AuthUser,
  CreateShareLinkOptions,
  OAuthProvider,
  ShareLink,
  UserInvitation,
  UserRole,
} from './auth-provider';
import { SHARE_TTL_MS } from './auth-provider';

// ─── Keycloak JS types (lazy-loaded) ────────────────────────────────

interface KeycloakInstance {
  init: (options: KeycloakInitOptions) => Promise<boolean>;
  login: (options?: {
    idpHint?: string;
    loginHint?: string;
    redirectUri?: string;
  }) => Promise<void>;
  logout: (options?: { redirectUri?: string }) => Promise<void>;
  register: (options?: { redirectUri?: string }) => Promise<void>;
  updateToken: (minValidity: number) => Promise<boolean>;
  token?: string;
  refreshToken?: string;
  tokenParsed?: {
    exp?: number;
    sub?: string;
    email?: string;
    name?: string;
    preferred_username?: string;
    realm_access?: { roles?: string[] };
    email_verified?: boolean;
    [key: string]: unknown;
  };
  authenticated?: boolean;
  subject?: string;
  onTokenExpired?: () => void;
  onAuthSuccess?: () => void;
  onAuthLogout?: () => void;
}

interface KeycloakInitOptions {
  onLoad?: 'login-required' | 'check-sso';
  flow?: 'standard' | 'implicit' | 'hybrid';
  pkceMethod?: 'S256';
  checkLoginIframe?: boolean;
  silentCheckSsoRedirectUri?: string;
  responseMode?: 'fragment' | 'query';
  enableLogging?: boolean;
}

interface KeycloakConstructor {
  new (config: { url: string; realm: string; clientId: string }): KeycloakInstance;
}

// ─── Config ─────────────────────────────────────────────────────────

export interface KeycloakAuthConfig {
  /** Keycloak server URL (e.g. https://keycloak.example.com) */
  url: string;
  /** Realm name (e.g. "hems") */
  realm: string;
  /** Client ID (e.g. "hems-dashboard") */
  clientId: string;
  /** Default role for users without realm roles */
  defaultRole?: UserRole;
}

// ─── In-memory share link storage (persisted via Dexie in auth-store) ──

const localShareLinks = new Map<string, ShareLink>();

// ─── Provider ───────────────────────────────────────────────────────

export class KeycloakAuthProvider implements AuthProvider {
  readonly type: AuthProviderType = 'keycloak';
  readonly displayName = 'Keycloak';

  private kc: KeycloakInstance | null = null;
  private config: KeycloakAuthConfig;
  private _configured: boolean;
  private listeners: Set<(session: AuthSession | null) => void> = new Set();

  constructor(config: KeycloakAuthConfig) {
    this.config = config;
    this._configured = Boolean(config.url && config.realm && config.clientId);
  }

  get configured(): boolean {
    return this._configured;
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  async initialize(): Promise<AuthSession | null> {
    if (!this._configured) return null;

    const Keycloak = await this.loadKeycloak();
    this.kc = new Keycloak({
      url: this.config.url,
      realm: this.config.realm,
      clientId: this.config.clientId,
    });

    // Set up token expiry handler
    this.kc.onTokenExpired = () => {
      this.kc?.updateToken(30).catch(() => {
        // Token refresh failed — user is logged out
        this.notifyListeners(null);
      });
    };

    this.kc.onAuthSuccess = () => {
      const session = this.buildSession();
      if (session) this.notifyListeners(session);
    };

    this.kc.onAuthLogout = () => {
      this.notifyListeners(null);
    };

    try {
      const authenticated = await this.kc.init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
        responseMode: 'fragment',
      });

      if (authenticated) {
        return this.buildSession();
      }
      return null;
    } catch {
      return null;
    }
  }

  destroy(): void {
    if (this.kc) {
      delete this.kc.onTokenExpired;
      delete this.kc.onAuthSuccess;
      delete this.kc.onAuthLogout;
    }
    this.listeners.clear();
    this.kc = null;
  }

  // ── Authentication ────────────────────────────────────────────

  async signIn(_credentials: AuthCredentials): Promise<AuthSession> {
    this.assertKc();
    // Keycloak handles credentials via its own login page (Authorization Code Flow)
    // Direct grant (password flow) is NOT recommended for SPAs — use login redirect
    await this.kc!.login({
      redirectUri: window.location.origin + import.meta.env.BASE_URL,
    });

    // After redirect back, initialize() will pick up the session
    const session = this.buildSession();
    if (!session) throw new Error('Authentication failed');
    return session;
  }

  async signUp(_credentials: AuthCredentials & { displayName?: string }): Promise<AuthSession> {
    this.assertKc();
    // Keycloak handles registration via its own registration page
    await this.kc!.register({
      redirectUri: window.location.origin + import.meta.env.BASE_URL,
    });

    const session = this.buildSession();
    if (!session) throw new Error('Registration failed');
    return session;
  }

  async signOut(): Promise<void> {
    this.assertKc();
    await this.kc!.logout({
      redirectUri: window.location.origin + import.meta.env.BASE_URL,
    });
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<void> {
    this.assertKc();
    // Keycloak identity brokering — idpHint maps to the IDP alias in Keycloak
    await this.kc!.login({
      idpHint: provider,
      redirectUri: window.location.origin + import.meta.env.BASE_URL,
    });
  }

  async signInWithMagicLink(email: string): Promise<void> {
    this.assertKc();
    // Use Keycloak's magic link authenticator (if configured) via login hint
    await this.kc!.login({
      loginHint: email,
      redirectUri: window.location.origin + import.meta.env.BASE_URL,
    });
  }

  async refreshSession(): Promise<AuthSession | null> {
    this.assertKc();
    try {
      await this.kc!.updateToken(30);
      return this.buildSession();
    } catch {
      return null;
    }
  }

  async getSession(): Promise<AuthSession | null> {
    if (!this.kc?.authenticated) return null;

    // Ensure token is still valid (refresh if < 60s left)
    try {
      await this.kc.updateToken(60);
    } catch {
      return null;
    }

    return this.buildSession();
  }

  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // ── User Management ───────────────────────────────────────────

  async updateProfile(_updates: { displayName?: string; avatarUrl?: string }): Promise<AuthUser> {
    // Keycloak profile updates go through the Account Management console
    // or via the Admin REST API (requires admin token)
    const session = this.buildSession();
    if (!session) throw new Error('Not authenticated');
    return session.user;
  }

  async changePassword(_currentPassword: string, _newPassword: string): Promise<void> {
    this.assertKc();
    // Password changes in Keycloak go through the Account Management console
    // Redirect user to Keycloak's account management
    const accountUrl = `${this.config.url}/realms/${this.config.realm}/account/#/security/signingin`;
    window.open(accountUrl, '_blank', 'noopener,noreferrer');
  }

  async resetPassword(email: string): Promise<void> {
    this.assertKc();
    // Keycloak supports "Forgot Password" on the login page
    await this.kc!.login({
      loginHint: email,
      redirectUri: window.location.origin + import.meta.env.BASE_URL,
    });
  }

  // ── Multi-User / Household ────────────────────────────────────

  async inviteUser(
    invitation: Omit<UserInvitation, 'token' | 'expiresAt'>,
  ): Promise<UserInvitation> {
    // Keycloak user management is via the Admin REST API
    // For client-side, we store an invitation token locally
    const token = this.generateToken();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    return {
      email: invitation.email,
      role: invitation.role,
      householdId: invitation.householdId,
      token,
      expiresAt,
    };
  }

  async acceptInvitation(_token: string): Promise<AuthUser> {
    const session = this.buildSession();
    if (!session) throw new Error('Not authenticated');
    return session.user;
  }

  async listHouseholdMembers(_householdId: string): Promise<AuthUser[]> {
    // Would require Keycloak Admin REST API access
    const session = this.buildSession();
    if (!session) return [];
    return [session.user];
  }

  // ── Share Links ───────────────────────────────────────────────

  async createShareLink(options: CreateShareLinkOptions): Promise<ShareLink> {
    const session = this.buildSession();
    if (!session) throw new Error('Not authenticated');

    const now = Date.now();
    const ttlMs = SHARE_TTL_MS[options.ttl];
    const expiresAt = now + ttlMs;

    const baseUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
    const apiBase = import.meta.env.VITE_API_URL ?? '';

    try {
      const perm = options.permissions === 'control' ? 'control' : 'view';
      const res = await fetch(`${apiBase}/api/shares`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          name: options.label ?? 'Shared link',
          permissions: perm,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { shareId?: string; redeemToken?: string };
        if (data.shareId && data.redeemToken) {
          const composite = `${data.shareId}:${data.redeemToken}`;
          const url = `${baseUrl}?share=${encodeURIComponent(composite)}`;
          const link: ShareLink = {
            id: data.shareId,
            token: composite,
            url,
            permissions: options.permissions,
            expiresAt,
            expiresInLabel: options.ttl,
            createdBy: session.user.id,
            createdAt: now,
            label: options.label,
            useCount: 0,
            maxUses: options.maxUses ?? 0,
            active: true,
          };
          localShareLinks.set(link.id, link);
          return link;
        }
      }
    } catch {
      /* fall through to offline share map */
    }

    const token = this.generateToken();
    const url = `${baseUrl}?share=${encodeURIComponent(token)}`;

    const link: ShareLink = {
      id: crypto.randomUUID(),
      token,
      url,
      permissions: options.permissions,
      expiresAt,
      expiresInLabel: options.ttl,
      createdBy: session.user.id,
      createdAt: now,
      label: options.label,
      useCount: 0,
      maxUses: options.maxUses ?? 0,
      active: true,
    };

    localShareLinks.set(link.id, link);
    return link;
  }

  async validateShareToken(
    token: string,
  ): Promise<{ valid: boolean; permissions?: 'view' | 'control'; expiresAt?: number }> {
    const colonIdx = token.indexOf(':');
    const apiBase = import.meta.env.VITE_API_URL ?? '';
    if (colonIdx > 0 && token.length > colonIdx + 32) {
      const shareId = token.slice(0, colonIdx);
      const secret = token.slice(colonIdx + 1);
      try {
        const res = await fetch(`${apiBase}/api/shares/${encodeURIComponent(shareId)}/redeem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: secret }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            permissions?: string;
            expiresAt?: number;
          };
          const rawPerm = data.permissions ?? 'view';
          const permissions: 'view' | 'control' = rawPerm === 'view' ? 'view' : 'control';
          return {
            valid: true,
            permissions,
            expiresAt: data.expiresAt ?? Date.now() + 86_400_000,
          };
        }
      } catch {
        /* offline/local fallback */
      }
    }

    for (const link of localShareLinks.values()) {
      if (link.token === token && link.active) {
        if (link.expiresAt < Date.now()) return { valid: false };
        if (link.maxUses > 0 && link.useCount >= link.maxUses) return { valid: false };

        link.useCount++;
        return { valid: true, permissions: link.permissions, expiresAt: link.expiresAt };
      }
    }
    return { valid: false };
  }

  async listShareLinks(): Promise<ShareLink[]> {
    return Array.from(localShareLinks.values()).filter((l) => l.active);
  }

  async revokeShareLink(linkId: string): Promise<void> {
    const link = localShareLinks.get(linkId);
    if (link) link.active = false;
  }

  // ── Private Helpers ───────────────────────────────────────────

  private assertKc(): void {
    if (!this.kc) throw new Error('Keycloak not initialized — call initialize() first');
  }

  private buildSession(): AuthSession | null {
    if (!this.kc?.authenticated || !this.kc.token || !this.kc.tokenParsed) return null;

    const tp = this.kc.tokenParsed;

    return {
      accessToken: this.kc.token,
      refreshToken: this.kc.refreshToken,
      expiresAt: tp.exp ? tp.exp * 1000 : Date.now() + 300_000,
      user: {
        id: tp.sub ?? this.kc.subject ?? '',
        email: tp.email ?? '',
        displayName: tp.name ?? tp.preferred_username,
        role: this.extractRole(tp.realm_access?.roles),
        provider: 'keycloak',
        lastSignIn: new Date().toISOString(),
        emailVerified: tp.email_verified ?? false,
      },
    };
  }

  /**
   * Extract the highest HEMS role from Keycloak realm roles.
   * Keycloak roles should match: viewer, operator, admin, owner
   */
  private extractRole(roles?: string[]): UserRole {
    if (!roles) return this.config.defaultRole ?? 'viewer';

    const hierarchy: UserRole[] = ['owner', 'admin', 'operator', 'viewer'];
    for (const role of hierarchy) {
      if (roles.includes(role)) return role;
    }
    return this.config.defaultRole ?? 'viewer';
  }

  private generateToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  private notifyListeners(session: AuthSession | null): void {
    for (const listener of this.listeners) {
      listener(session);
    }
  }

  private async loadKeycloak(): Promise<KeycloakConstructor> {
    const module = await import('keycloak-js');
    return (module.default ?? module) as unknown as KeycloakConstructor;
  }
}
