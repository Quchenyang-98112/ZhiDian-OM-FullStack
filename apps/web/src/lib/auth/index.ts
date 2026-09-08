/**
 * Auth Module — barrel export
 *
 * Usage:
 *   import { useAuthStore, useAuthUser, hasPermission, SupabaseAuthProvider } from '@/lib/auth';
 */

// ── Types & Interface ───────────────────────────────────────────────
export type {
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

export { hasPermission, ROLE_PERMISSIONS, roleLevel, SHARE_TTL_MS } from './auth-provider';
// ── Store & Hooks ───────────────────────────────────────────────────
export { useAuthStore, useAuthUser, useIsAuthenticated, useUserRole } from './auth-store';
export type { KeycloakAuthConfig } from './keycloak-provider';

export { KeycloakAuthProvider } from './keycloak-provider';
export type { SupabaseAuthConfig } from './supabase-provider';
// ── Providers ───────────────────────────────────────────────────────
export { SupabaseAuthProvider } from './supabase-provider';
