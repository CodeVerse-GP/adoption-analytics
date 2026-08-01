/**
 * Names of well-known analytics event actions that the adoption analytics plugin
 * treats specially (e.g. sign-in for DAU / WAU aggregation).
 */
export const ADOPTION_ANALYTICS_EVENT_ACTIONS = {
  signIn: 'sign-in',
  navigate: 'navigate',
  click: 'click',
  search: 'search',
} as const;

/**
 * `window.sessionStorage` key under which the adoption analytics plugin persists
 * its client-generated session id. Kept per browser tab so a page
 * refresh keeps the same session while a new tab starts a new one.
 */
export const ADOPTION_ANALYTICS_SESSION_STORAGE_KEY =
  'adoption-analytics.sessionId';

export type AdoptionAnalyticsEventAction =
  (typeof ADOPTION_ANALYTICS_EVENT_ACTIONS)[keyof typeof ADOPTION_ANALYTICS_EVENT_ACTIONS];

/**
 * The payload sent from the frontend to the adoption analytics backend for a single
 * analytics event.
 */
export interface AdoptionAnalyticsEvent {
  /** Event action, e.g. `navigate`, `sign-in`, `click`. */
  action: string;
  /** Free-form subject, typically a route path or feature name. */
  subject: string;
  /** Optional numeric value associated with the event (e.g. duration). */
  value?: number;
  /** Backstage plugin id where the event originated. */
  pluginId?: string;
  /** Route path the event happened on. */
  pathname?: string;
  /**
   * Client-generated per-tab session id. Optional so pre-existing
   * captures without one still validate.
   */
  sessionId?: string;
  /** ISO timestamp when the event was captured on the client. */
  timestamp: string;
}

/**
 * A daily snapshot of entity counts. `counts` sums per kind for backwards
 * compatibility; `countsByType` breaks each kind down by `spec.type`
 * (or the empty string when an entity has no type).
 */
export interface EntityCountSnapshot {
  /** ISO date (YYYY-MM-DD) of the snapshot. */
  date: string;
  /** Number of entities per kind (`Component`, `API`, ...). */
  counts: Record<string, number>;
  /**
   * Per-kind, per-type counts (`Component.service = 12`, `API.openapi = 4`,
   * ...). Missing on snapshots recorded before the `type` column existed.
   */
  countsByType?: Record<string, Record<string, number>>;
  /** Total across all kinds. */
  total: number;
}

/**
 * Aggregated active-user counts over a rolling time window.
 */
export interface ActiveUsersSummary {
  window: 'daily' | 'weekly';
  /** ISO date buckets in ascending order. */
  points: Array<{
    date: string;
    activeUsers: number;
  }>;
}

/**
 * A single login event surfaced by the adoption analytics backend.
 */
export interface LoginEvent {
  /** User entity ref, e.g. `user:default/alice`. */
  userRef: string;
  /** ISO timestamp when the sign-in happened. */
  timestamp: string;
}

/**
 * Supported dashboard time ranges. All ranges use daily buckets.
 */
export type AdoptionAnalyticsTimeRange = '7d' | '30d' | '90d';

/**
 * A KPI value plus its percentage change vs. the previous period of the
 * same length. `deltaPct` is `null` when there is no prior data to
 * compare against.
 */
export interface KpiWithDelta {
  value: number;
  deltaPct: number | null;
}

export interface WauSessionsBucket {
  /** ISO date of the last day in the week bucket. */
  date: string;
  wau: number;
  sessions: number;
}

export interface EntityGrowthPoint {
  date: string;
  /** Counts per entity kind at this point in time. */
  counts: Record<string, number>;
  /**
   * Per-kind, per-type counts for the same point in time. Optional so
   * the aggregator can omit it on legacy snapshots that lack a `type`.
   */
  countsByType?: Record<string, Record<string, number>>;
}

export interface TopEntityStat {
  /** Entity ref like `component:default/payment-service`. */
  entityRef: string;
  name: string;
  kind: string;
  owner: string | null;
  views: number;
  /** Percentage change in views vs. the previous period. Null if unknown. */
  trendPct: number | null;
}

/**
 * One row of the "Top Visited Pages" table.
 *
 * Paths are grouped by their first segment (`/docs/default/component/foo`
 * becomes `/docs`) because raw pathnames embed entity refs and task ids,
 * which would produce a long tail of single-view rows. The per-entity
 * detail that grouping discards is already covered by
 * {@link TopEntityStat}.
 */
export interface TopPageStat {
  /** Grouped path, e.g. `/docs`. `/` is the portal home page. */
  path: string;
  /** Navigation events to this group in the current window. */
  views: number;
  /** Percentage change in views vs. the previous period. Null if unknown. */
  trendPct: number | null;
}

/**
 * One row per distinct user that produced at least one event in the
 * selected time window.
 */
export interface ActiveUserSummary {
  /** User entity ref, e.g. `user:default/alice`. */
  userRef: string;
  /** ISO timestamp of the user's first event in the window. */
  firstSeen: string;
  /** ISO timestamp of the user's most recent event in the window. */
  lastSeen: string;
  /** Total events recorded for the user in the window. */
  eventCount: number;
}

/**
 * Aggregated search-query statistics.
 */
export interface SearchTermStat {
  /** Normalised query text (lowercased, trimmed). */
  query: string;
  /** Number of times the query was searched in the window. */
  count: number;
  /** Number of distinct users who ran that query. */
  users: number;
  /** ISO timestamp of the most recent occurrence. */
  lastSeen: string;
}

export interface SearchVolumePoint {
  /** ISO date bucket (YYYY-MM-DD). */
  date: string;
  /** Number of search events fired that day. */
  searches: number;
  /** Distinct users who searched that day. */
  users: number;
}

export interface SearchAnalytics {
  /** Total number of search events in the window. */
  total: number;
  /** Top-N most-searched queries, most-frequent first. */
  topTerms: SearchTermStat[];
  /** Per-day search volume across the window, chronological. */
  volume: SearchVolumePoint[];
}

/**
 * Everything the adoption analytics dashboard needs, computed in one request so
 * the UI can render without stitching multiple endpoints together.
 */
export interface AdoptionAnalyticsDashboard {
  range: AdoptionAnalyticsTimeRange;
  /** ISO timestamp when the dashboard payload was assembled. */
  generatedAt: string;
  kpis: {
    totalEntities: KpiWithDelta;
    dau: KpiWithDelta;
    wau: KpiWithDelta;
    /** Average session length in minutes over the current period. */
    avgSessionMinutes: KpiWithDelta;
  };
  dau: ActiveUsersSummary;
  wauSessions: WauSessionsBucket[];
  entityGrowth: EntityGrowthPoint[];
  topEntities: TopEntityStat[];
  /** Most-visited page groups in the current window, most-viewed first. */
  topPages: TopPageStat[];
  /** Distinct users active in the current window, most-recent first. */
  activeUsers: ActiveUserSummary[];
  /** Aggregated search-query statistics for the current window. */
  search: SearchAnalytics;
}
