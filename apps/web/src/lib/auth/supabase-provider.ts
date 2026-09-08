/**
 * Supabase Auth Provider — Managed BaaS Authentication
 *
 * Uses Supabase Auth for:
 *   - Email/password sign-in/sign-up
 *   - OAuth social login (Google, GitHub, Apple, Microsoft)
 *   - Magic link (passwordless)
 *   - JWT access tokens (auto-refreshed)
 *   - Row Level Security (RLS) for multi-tenant data isolation
 *
 * Configuration:
 *   Store SUPABASE_URL and SUPABASE_ANON_KEY in the encrypted Dexie vault.
 *   Never in .env files or hardcoded — follows BYOK pattern.
 *
 * Setup:
 *   1. Create Supabase project → get URL + anon key
 *   2. Enable Email auth + desired OAuth providers
 *   3. Create `households` and `share_links` tables (see SQL below)
 *   4. Enter credentials in Settings → Auth → Supabase
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

// ─── Supabase client types (lazy-loaded) ────────────────────────────

interface SupabaseClient {
  auth: {
    signInWithPassword: (creds: {
      email: string;
      password: string;
    }) => Promise<{ data: { session: SupabaseSession | null }; error: SupabaseError | null }>;
    signUp: (creds: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown> };
    }) => Promise<{ data: { session: SupabaseSession | null }; error: SupabaseError | null }>;
    signOut: () => Promise<{ error: SupabaseError | null }>;
    signInWithOAuth: (opts: {
      provider: string;
      options?: { redirectTo?: string };
    }) => Promise<{ error: SupabaseError | null }>;
    signInWithOtp: (opts: {
      email: string;
      options?: { emailRedirectTo?: string };
    }) => Promise<{ error: SupabaseError | null }>;
    getSession: () => Promise<{
      data: { session: SupabaseSession | null };
      error: SupabaseError | null;
    }>;
    refreshSession: () => Promise<{
      data: { session: SupabaseSession | null };
      error: SupabaseError | null;
    }>;
    updateUser: (updates: {
      data?: Record<string, unknown>;
      password?: string;
    }) => Promise<{ data: { user: SupabaseUser | null }; error: SupabaseError | null }>;
    resetPasswordForEmail: (
      email: string,
      opts?: { redirectTo?: string },
    ) => Promise<{ error: SupabaseError | null }>;
    onAuthStateChange: (callback: (event: string, session: SupabaseSession | null) => void) => {
      data: { subscription: { unsubscribe: () => void } };
    };
  };
  from: (table: string) => SupabaseQueryBuilder;
}

interface SupabaseQueryBuilder {
  select: (columns?: string) => SupabaseQueryBuilder;
  insert: (data: Record<string, unknown> | Record<string, unknown>[]) => SupabaseQueryBuilder;
  update: (data: Record<string, unknown>) => SupabaseQueryBuilder;
  delete: () => SupabaseQueryBuilder;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder;
  single: () => Promise<{ data: Record<string, unknown> | null; error: SupabaseError | null }>;
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null;
    error: SupabaseError | null;
  }>;
  then: (
    resolve: (result: {
      data: Record<string, unknown>[] | null;
      error: SupabaseError | null;
    }) => void,
  ) => void;
}

interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in: number;
  user: SupabaseUser;
}

interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
}

interface SupabaseError {
  message: string;
  status?: number;
}

// ─── Config ─────────────────────────────────────────────────────────

export interface SupabaseAuthConfig {
  /** Supabase project URL (e.g. https://xyz.supabase.co) */
  url: string;
  /** Supabase anon/public key */
  anonKey: string;
  /** Default role for new users */
  defaultRole?: UserRole;
}

// ─── Provider ───────────────────────────────────────────────────────

export class SupabaseAuthProvider implements AuthProvider {
  readonly type: AuthProviderType = 'supabase';
  readonly displayName = 'Supabase';

  private client: SupabaseClient | null = null;
  private config: SupabaseAuthConfig;
  private _configured: boolean;
  private unsubscribe?: () => void;
  private listeners: Set<(session: AuthSession | null) => void> = new Set();

  constructor(config: SupabaseAuthConfig) {
    this.config = config;
    this._configured = Boolean(config.url && config.anonKey);
  }

  get configured(): boolean {
    return this._configured;
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  async initialize(): Promise<AuthSession | null> {
    if (!this._configured) return null;

    // Lazy-load Supabase client
    const { createClient } = await import('@supabase/supabase-js');
    this.client = createClient(this.config.url, this.config.anonKey) as unknown as SupabaseClient;

    // Listen for auth changes
    const {
      data: { subscription },
    } = this.client.auth.onAuthStateChange((_event, session) => {
      const mapped = session ? this.mapSession(session) : null;
      for (const listener of this.listeners) {
        listener(mapped);
      }
    });
    this.unsubscribe = () => subscription.unsubscribe();

    // Check for existing session
    const {
      data: { session },
    } = await this.client.auth.getSession();
    return session ? this.mapSession(session) : null;
  }

  destroy(): void {
    this.unsubscribe?.();
    this.listeners.clear();
    this.client = null;
  }

  // ── Authentication ────────────────────────────────────────────

  async signIn(credentials: AuthCredentials): Promise<AuthSession> {
    this.assertClient();
    const {
      data: { session },
      error,
    } = await this.client!.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) throw new Error(error.message);
    if (!session) throw new Error('No session returned');
    return this.mapSession(session);
  }

  async signUp(credentials: AuthCredentials & { displayName?: string }): Promise<AuthSession> {
    this.assertClient();
    const {
      data: { session },
      error,
    } = await this.client!.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: { display_name: credentials.displayName },
      },
    });

    if (error) throw new Error(error.message);
    if (!session) throw new Error('Email confirmation required');
    return this.mapSession(session);
  }

  async signOut(): Promise<void> {
    this.assertClient();
    const { error } = await this.client!.auth.signOut();
    if (error) throw new Error(error.message);
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<void> {
    this.assertClient();
    const { error } = await this.client!.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    if (error) throw new Error(error.message);
  }

  async signInWithMagicLink(email: string): Promise<void> {
    this.assertClient();
    const { error } = await this.client!.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    if (error) throw new Error(error.message);
  }

  async refreshSession(): Promise<AuthSession | null> {
    this.assertClient();
    const {
      data: { session },
    } = await this.client!.auth.refreshSession();
    return session ? this.mapSession(session) : null;
  }

  async getSession(): Promise<AuthSession | null> {
    this.assertClient();
    const {
      data: { session },
    } = await this.client!.auth.getSession();
    return session ? this.mapSession(session) : null;
  }

  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // ── User Management ───────────────────────────────────────────

  async updateProfile(updates: { displayName?: string; avatarUrl?: string }): Promise<AuthUser> {
    this.assertClient();
    const {
      data: { user },
      error,
    } = await this.client!.auth.updateUser({
      data: {
        display_name: updates.displayName,
        avatar_url: updates.avatarUrl,
      },
    });

    if (error) throw new Error(error.message);
    if (!user) throw new Error('Failed to update profile');
    return this.mapUser(user);
  }

  async changePassword(_currentPassword: string, newPassword: string): Promise<void> {
    this.assertClient();
    const { error } = await this.client!.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  }

  async resetPassword(email: string): Promise<void> {
    this.assertClient();
    const { error } = await this.client!.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}settings`,
    });
    if (error) throw new Error(error.message);
  }

  // ── Multi-User / Household ────────────────────────────────────

  async inviteUser(
    invitation: Omit<UserInvitation, 'token' | 'expiresAt'>,
  ): Promise<UserInvitation> {
    this.assertClient();
    const token = this.generateToken();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    const result = await this.client!.from('user_invitations')
      .insert({
        email: invitation.email,
        role: invitation.role,
        household_id: invitation.householdId,
        token,
        expires_at: new Date(expiresAt).toISOString(),
      })
      .single();

    if (result.error) throw new Error(result.error.message);

    return { ...invitation, token, expiresAt };
  }

  async acceptInvitation(token: string): Promise<AuthUser> {
    this.assertClient();
    const result = await this.client!.from('user_invitations')
      .select()
      .eq('token', token)
      .maybeSingle();

    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error('Invalid invitation');

    const invitation = result.data;
    if (new Date(invitation.expires_at as string) < new Date()) {
      throw new Error('Invitation expired');
    }

    // Get current session
    const session = await this.getSession();
    if (!session) throw new Error('Not authenticated');

    // Add user to household
    await this.client!.from('household_members').insert({
      household_id: invitation.household_id,
      user_id: session.user.id,
      role: invitation.role,
    });

    // Delete used invitation
    await this.client!.from('user_invitations').delete().eq('token', token);

    return {
      ...session.user,
      role: invitation.role as UserRole,
      householdId: invitation.household_id as string,
    };
  }

  async listHouseholdMembers(householdId: string): Promise<AuthUser[]> {
    this.assertClient();
    return new Promise((resolve, reject) => {
      this.client!.from('household_members')
        .select('user_id, role, profiles(id, email, display_name, avatar_url)')
        .eq('household_id', householdId)
        .then((result) => {
          if (result.error) return reject(new Error(result.error.message));
          resolve(
            (result.data ?? []).map((row) => {
              const profile = row.profiles as Record<string, unknown> | null;
              return {
                id: row.user_id as string,
                email: (profile?.email as string) ?? '',
                displayName: (profile?.display_name as string) ?? undefined,
                avatarUrl: (profile?.avatar_url as string) ?? undefined,
                role: row.role as UserRole,
                householdId,
                provider: 'supabase' as const,
                emailVerified: true,
              };
            }),
          );
        });
    });
  }

  async removeHouseholdMember(householdId: string, userId: string): Promise<void> {
    this.assertClient();
    const result = await this.client!.from('household_members')
      .delete()
      .eq('household_id', householdId)
      .eq('user_id', userId);
    if (result.error) throw new Error(result.error.message);
  }

  async updateUserRole(userId: string, role: UserRole): Promise<void> {
    this.assertClient();
    const result = await this.client!.from('household_members')
      .update({ role })
      .eq('user_id', userId);
    if (result.error) throw new Error(result.error.message);
  }

  // ── Share Links ───────────────────────────────────────────────

  async createShareLink(options: CreateShareLinkOptions): Promise<ShareLink> {
    this.assertClient();
    const session = await this.getSession();
    if (!session) throw new Error('Not authenticated');

    const ttlMs = (
      {
        '1h': 3_600_000,
        '6h': 21_600_000,
        '24h': 86_400_000,
        '7d': 604_800_000,
        '30d': 2_592_000_000,
      } satisfies Record<string, number>
    )[options.ttl];

    const token = this.generateToken();
    const now = Date.now();
    const expiresAt = now + ttlMs;

    const linkData = {
      token,
      permissions: options.permissions,
      expires_at: new Date(expiresAt).toISOString(),
      created_by: session.user.id,
      label: options.label ?? null,
      max_uses: options.maxUses ?? 0,
      use_count: 0,
      active: true,
    };

    const result = await this.client!.from('share_links').insert(linkData).single();
    if (result.error) throw new Error(result.error.message);

    const id = (result.data?.id as string) ?? token;
    const baseUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
    const url = `${baseUrl}?share=${encodeURIComponent(token)}`;

    return {
      id,
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
  }

  async validateShareToken(
    token: string,
  ): Promise<{ valid: boolean; permissions?: 'view' | 'control'; expiresAt?: number }> {
    this.assertClient();
    const result = await this.client!.from('share_links')
      .select()
      .eq('token', token)
      .eq('active', true)
      .maybeSingle();

    if (result.error || !result.data) return { valid: false };

    const link = result.data;
    const expiresAt = new Date(link.expires_at as string).getTime();

    if (expiresAt < Date.now()) return { valid: false };

    const maxUses = link.max_uses as number;
    const useCount = link.use_count as number;
    if (maxUses > 0 && useCount >= maxUses) return { valid: false };

    // Increment use count
    await this.client!.from('share_links')
      .update({ use_count: useCount + 1 })
      .eq('token', token);

    return {
      valid: true,
      permissions: link.permissions as 'view' | 'control',
      expiresAt,
    };
  }

  async listShareLinks(): Promise<ShareLink[]> {
    this.assertClient();
    return new Promise((resolve, reject) => {
      this.client!.from('share_links')
        .select()
        .eq('active', true)
        .then((result) => {
          if (result.error) return reject(new Error(result.error.message));
          const baseUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
          resolve(
            (result.data ?? []).map((row) => ({
              id: row.id as string,
              token: row.token as string,
              url: `${baseUrl}?share=${encodeURIComponent(row.token as string)}`,
              permissions: row.permissions as 'view' | 'control',
              expiresAt: new Date(row.expires_at as string).getTime(),
              expiresInLabel: '',
              createdBy: row.created_by as string,
              createdAt: new Date(row.created_at as string).getTime(),
              label: row.label != null ? (row.label as string) : undefined,
              useCount: row.use_count as number,
              maxUses: row.max_uses as number,
              active: row.active as boolean,
            })),
          );
        });
    });
  }

  async revokeShareLink(linkId: string): Promise<void> {
    this.assertClient();
    const result = await this.client!.from('share_links')
      .update({ active: false })
      .eq('id', linkId);
    if (result.error) throw new Error(result.error.message);
  }

  // ── Private Helpers ───────────────────────────────────────────

  private assertClient(): void {
    if (!this.client) throw new Error('Supabase client not initialized — call initialize() first');
  }

  private mapSession(session: SupabaseSession): AuthSession {
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at
        ? session.expires_at * 1000
        : Date.now() + session.expires_in * 1000,
      user: this.mapUser(session.user),
    };
  }

  private mapUser(user: SupabaseUser): AuthUser {
    return {
      id: user.id,
      email: user.email ?? '',
      displayName: (user.user_metadata?.display_name as string) ?? undefined,
      avatarUrl: (user.user_metadata?.avatar_url as string) ?? undefined,
      role: (user.user_metadata?.role as UserRole) ?? this.config.defaultRole ?? 'viewer',
      provider: 'supabase',
      lastSignIn: user.last_sign_in_at,
      emailVerified: Boolean(user.email_confirmed_at),
    };
  }

  private generateToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}
