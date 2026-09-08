/**
 * Auth Provider Interface — Pluggable Authentication for HEMS Dashboard
 *
 * Supports multiple auth backends:
 *   1. Supabase — Managed BaaS with email/OAuth/magic-link
 *   2. Keycloak — Self-hosted OpenID Connect / SAML 2.0
 *   3. Firebase — Google Cloud auth (planned)
 *   4. Self-hosted JWT — Custom backend (server.ts already has JWT)
 *
 * Each provider implements this interface so the dashboard can switch
 * between auth backends without changing any UI code.
 */

// ─── User & Session Types ───────────────────────────────────────────

/** User roles for RBAC */
export type UserRole = 'viewer' | 'operator' | 'admin' | 'owner';

/** Permissions per role (cumulative: owner > admin > operator > viewer) */
export const ROLE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  viewer: ['dashboard:read', 'energy:read', 'analytics:read'],
  operator: [
    'dashboard:read',
    'energy:read',
    'analytics:read',
    'device:control',
    'ev:control',
    'heatpump:control',
  ],
  admin: [
    'dashboard:read',
    'energy:read',
    'analytics:read',
    'device:control',
    'ev:control',
    'heatpump:control',
    'settings:write',
    'adapter:manage',
    'users:read',
  ],
  owner: [
    'dashboard:read',
    'energy:read',
    'analytics:read',
    'device:control',
    'ev:control',
    'heatpump:control',
    'settings:write',
    'adapter:manage',
    'users:read',
    'users:manage',
    'share:manage',
    'billing:manage',
  ],
} as const;

/** Authenticated user profile */
export interface AuthUser {
  /** Unique user identifier (UUID from provider) */
  id: string;
  /** Email address */
  email: string;
  /** Display name */
  displayName?: string | undefined;
  /** Avatar URL */
  avatarUrl?: string | undefined;
  /** Assigned role */
  role: UserRole;
  /** Household / installation ID this user belongs to */
  householdId?: string | undefined;
  /** Auth provider that authenticated this user */
  provider: AuthProviderType;
  /** ISO timestamp of last sign-in */
  lastSignIn?: string | undefined;
  /** Whether email is verified */
  emailVerified: boolean;
  /** Raw metadata from the auth provider */
  metadata?: Record<string, unknown> | undefined;
}

/** Auth session with tokens */
export interface AuthSession {
  /** Access token (JWT) */
  accessToken: string;
  /** Refresh token for silent renewal */
  refreshToken?: string | undefined;
  /** Token expiry (Unix ms) */
  expiresAt: number;
  /** User profile */
  user: AuthUser;
}

/** Supported auth providers */
export type AuthProviderType = 'supabase' | 'keycloak' | 'firebase' | 'self-hosted' | 'none';

/** OAuth social login providers */
export type OAuthProvider = 'google' | 'github' | 'apple' | 'microsoft';

/** Sign-up / sign-in credentials */
export interface AuthCredentials {
  email: string;
  password: string;
}

/** Invitation for multi-user household sharing */
export interface UserInvitation {
  /** Invitee email */
  email: string;
  /** Role to assign */
  role: UserRole;
  /** Household to add user to */
  householdId: string;
  /** Expiry (Unix ms) */
  expiresAt: number;
  /** Invite token for the link */
  token: string;
}

// ─── Share Link Types ───────────────────────────────────────────────

/** Shareable time-limited QR link */
export interface ShareLink {
  /** Unique link identifier */
  id: string;
  /** Signed share token (JWT or opaque) */
  token: string;
  /** Full shareable URL */
  url: string;
  /** What this link grants access to */
  permissions: 'view' | 'control';
  /** Expiry timestamp (Unix ms) */
  expiresAt: number;
  /** Human-readable expiry label (e.g. "24h", "7d") */
  expiresInLabel: string;
  /** Who created this link */
  createdBy: string;
  /** Creation timestamp */
  createdAt: number;
  /** Optional label/name */
  label?: string | undefined;
  /** Number of times this link has been used */
  useCount: number;
  /** Maximum allowed uses (0 = unlimited) */
  maxUses: number;
  /** Whether this link is still active */
  active: boolean;
}

/** Options for creating a share link */
export interface CreateShareLinkOptions {
  /** Permission level */
  permissions: 'view' | 'control';
  /** Time-to-live preset */
  ttl: '1h' | '6h' | '24h' | '7d' | '30d';
  /** Max number of uses (0 = unlimited) */
  maxUses?: number;
  /** Optional label */
  label?: string;
}

/** TTL presets in milliseconds */
export const SHARE_TTL_MS: Record<CreateShareLinkOptions['ttl'], number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// ─── Auth Provider Interface ────────────────────────────────────────

/**
 * Every auth backend MUST implement this interface.
 * The dashboard code only talks to this interface — never to provider SDKs directly.
 */
export interface AuthProvider {
  /** Provider identifier */
  readonly type: AuthProviderType;

  /** Human-readable provider name */
  readonly displayName: string;

  /** Whether this provider is properly configured */
  readonly configured: boolean;

  // ── Lifecycle ─────────────────────────────────────────────────

  /** Initialize the provider (load SDK, check stored session) */
  initialize(): Promise<AuthSession | null>;

  /** Clean up resources */
  destroy(): void;

  // ── Authentication ────────────────────────────────────────────

  /** Email + password sign-in */
  signIn(credentials: AuthCredentials): Promise<AuthSession>;

  /** Email + password sign-up (creates new user) */
  signUp(credentials: AuthCredentials & { displayName?: string }): Promise<AuthSession>;

  /** Sign out current user */
  signOut(): Promise<void>;

  /** OAuth social login redirect */
  signInWithOAuth?(provider: OAuthProvider): Promise<void>;

  /** Magic link / passwordless sign-in */
  signInWithMagicLink?(email: string): Promise<void>;

  /** Refresh the access token */
  refreshSession(): Promise<AuthSession | null>;

  // ── Session ───────────────────────────────────────────────────

  /** Get current session (from memory or storage) */
  getSession(): Promise<AuthSession | null>;

  /** Subscribe to auth state changes */
  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void;

  // ── User Management ───────────────────────────────────────────

  /** Update user profile */
  updateProfile?(updates: { displayName?: string; avatarUrl?: string }): Promise<AuthUser>;

  /** Change password */
  changePassword?(currentPassword: string, newPassword: string): Promise<void>;

  /** Send password reset email */
  resetPassword?(email: string): Promise<void>;

  /** Delete account */
  deleteAccount?(): Promise<void>;

  // ── Multi-User / Household ────────────────────────────────────

  /** Invite a user to the household */
  inviteUser?(invitation: Omit<UserInvitation, 'token' | 'expiresAt'>): Promise<UserInvitation>;

  /** Accept an invitation */
  acceptInvitation?(token: string): Promise<AuthUser>;

  /** List household members */
  listHouseholdMembers?(householdId: string): Promise<AuthUser[]>;

  /** Remove a user from the household */
  removeHouseholdMember?(householdId: string, userId: string): Promise<void>;

  /** Update a user's role */
  updateUserRole?(userId: string, role: UserRole): Promise<void>;

  // ── Share Links ───────────────────────────────────────────────

  /** Create a time-limited share link */
  createShareLink(options: CreateShareLinkOptions): Promise<ShareLink>;

  /** Validate a share token and return permissions */
  validateShareToken(token: string): Promise<{
    valid: boolean;
    permissions?: 'view' | 'control';
    expiresAt?: number;
  }>;

  /** List all active share links */
  listShareLinks(): Promise<ShareLink[]>;

  /** Revoke a share link */
  revokeShareLink(linkId: string): Promise<void>;
}

// ─── Utility: permission check ──────────────────────────────────────

/**
 * Check if a user role has a specific permission.
 */
export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Get a role's permission level (for comparison: higher = more privileges).
 */
export function roleLevel(role: UserRole): number {
  const levels: Record<UserRole, number> = { viewer: 0, operator: 1, admin: 2, owner: 3 };
  return levels[role] ?? 0;
}
