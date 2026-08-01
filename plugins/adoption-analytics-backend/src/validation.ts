import { ADOPTION_ANALYTICS_EVENT_ACTIONS } from '@codeverse-gp/plugin-adoption-analytics-common';
import { z } from 'zod';

/**
 * Validates a single incoming analytics event payload from the frontend.
 * Kept intentionally permissive on `action` / `subject` so we don't drop
 * events for plugins we don't yet know about, but constrains sizes so
 * one client cannot poison the DB with unbounded strings.
 */
export const adoptionAnalyticsEventSchema = z.object({
  action: z.string().min(1).max(128),
  subject: z.string().min(1).max(512),
  value: z.number().finite().optional(),
  pluginId: z.string().max(128).optional(),
  pathname: z.string().max(1024).optional(),
  // Client-generated per-tab session id. Optional so older frontends
  // still validate; bounded so a caller can't push arbitrarily large
  // strings into the DB.
  sessionId: z.string().min(1).max(128).optional(),
  timestamp: z.string().datetime(),
});

export const adoptionAnalyticsEventBatchSchema = z.object({
  events: z.array(adoptionAnalyticsEventSchema).min(1).max(100),
});

export const activeUsersQuerySchema = z.object({
  window: z.enum(['daily', 'weekly']).default('daily'),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const recentLoginsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const entityCountsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const dashboardQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d'),
});

export const KNOWN_EVENT_ACTIONS = ADOPTION_ANALYTICS_EVENT_ACTIONS;
