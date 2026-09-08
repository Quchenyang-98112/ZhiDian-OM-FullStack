/**
 * MED-06 — Server-backed dashboard share create/redeem contracts.
 */

import { z } from 'zod';

export const CreateDashboardShareRequestSchema = z.object({
  name: z.string().min(1).max(200),
  permissions: z.enum(['view', 'control', 'admin']).default('view'),
});

export type CreateDashboardShareRequest = z.infer<typeof CreateDashboardShareRequestSchema>;

export const CreateDashboardShareResponseSchema = z.object({
  shareId: z.string().uuid(),
  redeemToken: z.string().min(32),
  expiresInMs: z.number().int().positive(),
});

export type CreateDashboardShareResponse = z.infer<typeof CreateDashboardShareResponseSchema>;

export const RedeemDashboardShareRequestSchema = z.object({
  token: z.string().min(32).max(256),
});

export type RedeemDashboardShareRequest = z.infer<typeof RedeemDashboardShareRequestSchema>;

export const RedeemDashboardShareResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  permissions: z.enum(['view', 'control', 'admin']),
  households: z.array(z.string()),
  expiresAt: z.number().optional(),
});

export type RedeemDashboardShareResponse = z.infer<typeof RedeemDashboardShareResponseSchema>;
