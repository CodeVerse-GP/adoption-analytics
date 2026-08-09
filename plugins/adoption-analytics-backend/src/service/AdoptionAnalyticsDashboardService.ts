import type { AuthService, LoggerService } from '@backstage/backend-plugin-api';
import type { Entity } from '@backstage/catalog-model';
import { parseEntityRef, stringifyEntityRef } from '@backstage/catalog-model';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import type {
  ActiveUserSummary,
  ActiveUsersSummary,
  EntityCountSnapshot,
  EntityGrowthPoint,
  AdoptionAnalyticsDashboard,
  AdoptionAnalyticsTimeRange,
  KpiWithDelta,
  PluginAdoptionStat,
  SearchAnalytics,
  SearchTermStat,
  SearchVolumePoint,
  TechDocsSiteStat,
  TopEntityStat,
  TopPageStat,
  WauSessionsBucket,
} from '@codeverse-gp/plugin-adoption-analytics-common';
import type { AdoptionAnalyticsDatabase } from './AdoptionAnalyticsDatabase';

type Options = {
  logger: LoggerService;
  db: AdoptionAnalyticsDatabase;
  catalog: CatalogService;
  auth: AuthService;
};

const RANGE_DAYS: Record<AdoptionAnalyticsTimeRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const TOP_ENTITIES_LIMIT = 8;

const TOP_DOCS_LIMIT = 8;

/**
 * How many page groups the payload carries. Larger than the entity limit
 * because the table paginates client-side rather than showing every row
 * at once.
 */
const TOP_PAGES_LIMIT = 20;

/** Cap on the plugin table; a portal rarely runs more than a few dozen. */
const PLUGIN_ADOPTION_LIMIT = 20;

/**
 * Days of history needed to compute {@link SharedKpis}. Driven by
 * `wauKpi`, which compares the trailing 7 days against the 7 before
 * that; `dauKpi` and `avgSessionKpi` only look at today and yesterday.
 */
const SHARED_KPI_DAYS = 14;

/**
 * The KPI cards that ignore the range selector: they always describe
 * "right now" (today vs. yesterday, or the rolling week vs. the one
 * before). Split out from the range-scoped payload so callers can cache
 * them under a single key -- caching them per range makes the same card
 * show different numbers on each tab, because each tab's entry is
 * computed at a different moment.
 */
export type SharedKpis = Omit<
  AdoptionAnalyticsDashboard['kpis'],
  'totalEntities'
>;

/**
 * Computes the full dashboard payload from the raw events + snapshots tables.
 * Kept as a service (not inlined into the router) so aggregation can be
 * unit-tested against a fake database.
 */
export class AdoptionAnalyticsDashboardService {
  constructor(private readonly options: Options) {}

  async getDashboard(
    range: AdoptionAnalyticsTimeRange,
  ): Promise<AdoptionAnalyticsDashboard> {
    const { db } = this.options;
    const days = RANGE_DAYS[range];

    // Pull enough data to compute both the current window and a matching
    // previous window for delta calculations. The WAU chart always
    // shows at least 4 weekly buckets, so on the short 7-day range we
    // need history that reaches back further than `days * 2` — otherwise
    // older buckets in the chart end up empty even when users were
    // active before the selected window.
    const wauHistoryDays = 4 * 7;
    const rawDays = Math.max(days * 2, wauHistoryDays);
    const raw = await db.getRawEvents(rawDays);
    const snapshots = await db.getEntityCountSnapshots(days * 2);
    // Spans all retained history, not just `rawDays`, so the DAU split
    // doesn't call a long-standing user "new" the first time they show
    // up inside the selected window.
    const firstSeenByUser = await db.getFirstSeenByUser();

    const now = new Date();
    const nowIso = now.toISOString();
    // "Last N days" means N calendar days *including today*, so the window
    // starts N-1 days ago. Using `days` here would straddle N+1 calendar
    // dates and make the daily charts render one extra bucket (e.g. "8 days"
    // for a 7-day range). The previous window is kept symmetric: the N days
    // immediately preceding the current one.
    const windowStart = daysBefore(now, days - 1);
    const previousStart = daysBefore(now, days * 2 - 1);

    const current = raw.filter(e => e.timestamp >= windowStart);
    const previous = raw.filter(
      e => e.timestamp >= previousStart && e.timestamp < windowStart,
    );

    return {
      range,
      generatedAt: nowIso,
      kpis: {
        // Total Entities is the one KPI that follows the range selector —
        // it's a cumulative catalog-growth metric, so "how many entities
        // did we add in the last N days" is the useful comparison.
        totalEntities: this.totalEntitiesKpi(snapshots, RANGE_DAYS[range]),
        ...this.sharedKpis(raw, now),
      },
      dau: {
        window: 'daily',
        points: this.dauSeries(current, windowStart, now, firstSeenByUser),
      },
      // Pass the full raw window: `wauSessions` has its own per-bucket
      // filter that walks back from `now`, and buckets earlier than the
      // selected range still contain useful trend info (e.g. someone
      // logged in 3 weeks ago even though the range is "last 7 days").
      wauSessions: this.wauSessions(raw, windowStart, now, range),
      entityGrowth: this.entityGrowth(snapshots, range),
      topEntities: await this.topEntities(current, previous),
      topDocs: await this.topDocs(current, previous),
      topPages: this.topPages(current, previous),
      activeUsers: this.activeUsers(current),
      plugins: this.pluginAdoption(current, previous),
      search: this.searchAnalytics(current, windowStart, now),
    };
  }

  // ---- KPIs ------------------------------------------------------------

  /**
   * Computes the range-independent KPI cards on their own, so the router
   * can cache them under a key that is shared by every range.
   */
  async getSharedKpis(): Promise<SharedKpis> {
    const raw = await this.options.db.getRawEvents(SHARED_KPI_DAYS);
    return this.sharedKpis(raw, new Date());
  }

  /**
   * DAU always compares today vs yesterday and WAU the rolling week vs
   * the previous one, regardless of the selected range — these cards are
   * labelled "Daily"/"Weekly", so a range-scaled baseline was confusing
   * (it required N days of history before a delta would appear).
   */
  private sharedKpis(raw: RawEvent[], now: Date): SharedKpis {
    return {
      dau: this.dauKpi(raw, now),
      wau: this.wauKpi(raw, now),
      avgSessionMinutes: this.avgSessionKpi(raw, now),
    };
  }

  private totalEntitiesKpi(
    snapshots: EntityCountSnapshot[],
    days: number,
  ): KpiWithDelta {
    if (snapshots.length === 0) return { value: 0, deltaPct: null };
    const latest = snapshots[snapshots.length - 1];
    // Compare to a snapshot ~`days` earlier (driven by the range
    // selector) if we have one that old.
    const priorDate = daysBeforeIso(latest.date, days);
    const prior = [...snapshots].reverse().find(s => s.date <= priorDate);
    return {
      value: latest.total,
      deltaPct: prior ? pctChange(prior.total, latest.total) : null,
    };
  }

  private dauKpi(raw: RawEvent[], now: Date): KpiWithDelta {
    const today = isoDate(now);
    const yesterday = daysBeforeIso(today, 1);
    const c = uniqueUsersOnDay(raw, today);
    const p = uniqueUsersOnDay(raw, yesterday);
    return { value: c, deltaPct: p === 0 ? null : pctChange(p, c) };
  }

  /**
   * Rolling 7-day WAU vs. the 7 days before that. Range-independent so
   * the top KPI row acts as an "at-a-glance right now" summary; the
   * range selector only drives the trend charts below.
   */
  private wauKpi(raw: RawEvent[], now: Date): KpiWithDelta {
    const windowStart = daysBefore(now, 7);
    const priorStart = daysBefore(now, 14);
    const current = raw.filter(
      e => e.timestamp >= windowStart && e.timestamp < now,
    );
    const previous = raw.filter(
      e => e.timestamp >= priorStart && e.timestamp < windowStart,
    );
    const c = distinctUsers(current);
    const p = distinctUsers(previous);
    return { value: c, deltaPct: p === 0 ? null : pctChange(p, c) };
  }

  /**
   * Avg session length today vs. yesterday. Range-independent — same
   * reasoning as `wauKpi`.
   */
  private avgSessionKpi(raw: RawEvent[], now: Date): KpiWithDelta {
    const today = isoDate(now);
    const yesterday = daysBeforeIso(today, 1);
    const todayEvents = raw.filter(e => isoDate(e.timestamp) === today);
    const yesterdayEvents = raw.filter(e => isoDate(e.timestamp) === yesterday);
    const c = averageSessionMinutes(todayEvents);
    const p = averageSessionMinutes(yesterdayEvents);
    return { value: c, deltaPct: p === 0 ? null : pctChange(p, c) };
  }

  // ---- Series ----------------------------------------------------------

  private dauSeries(
    events: RawEvent[],
    from: Date,
    to: Date,
    firstSeenByUser: Map<string, string>,
  ): ActiveUsersSummary['points'] {
    const buckets = new Map<string, Set<string>>();
    for (const day of eachDay(from, to)) {
      buckets.set(day, new Set());
    }
    for (const e of events) {
      const day = isoDate(e.timestamp);
      const set = buckets.get(day);
      if (set) set.add(e.userRef);
    }
    return [...buckets.entries()].map(([date, users]) => {
      // Users missing from the map count as new so the two parts always
      // sum back to `activeUsers`.
      let newUsers = 0;
      for (const user of users) {
        if ((firstSeenByUser.get(user) ?? date) === date) newUsers += 1;
      }
      return {
        date,
        activeUsers: users.size,
        newUsers,
        returningUsers: users.size - newUsers,
      };
    });
  }

  private wauSessions(
    events: RawEvent[],
    from: Date,
    to: Date,
    range: AdoptionAnalyticsTimeRange,
  ): WauSessionsBucket[] {
    // Emit weekly buckets covering the selected window (min 4 buckets
    // for readability).
    const bucketCount = Math.max(4, Math.ceil(RANGE_DAYS[range] / 7));
    const buckets: WauSessionsBucket[] = [];
    for (let i = bucketCount - 1; i >= 0; i--) {
      const end = daysBefore(to, i * 7);
      const start = daysBefore(end, 7);
      const users = new Set<string>();
      // Use client-assigned `sessionId` when the event has one so
      // "sessions" reflects real browser sessions rather than
      // day-buckets. Legacy events without a sessionId fall back to
      // the (userRef, day) synthetic key so the chart stays continuous.
      const sessions = new Set<string>();
      for (const e of events) {
        if (e.timestamp > start && e.timestamp <= end) {
          users.add(e.userRef);
          const sessionKey = e.sessionId
            ? `${e.userRef}|${e.sessionId}`
            : `${e.userRef}|${isoDate(e.timestamp)}`;
          sessions.add(sessionKey);
        }
      }
      buckets.push({
        date: isoDate(end),
        wau: users.size,
        sessions: sessions.size,
      });
    }
    void from;
    return buckets;
  }

  private entityGrowth(
    snapshots: EntityCountSnapshot[],
    range: AdoptionAnalyticsTimeRange,
  ): EntityGrowthPoint[] {
    // Use the daily snapshots within the selected window directly.
    // `countsByType` mirrors `counts` so the frontend can offer a
    // per-kind-type drill-down.
    const toPoint = (s: EntityCountSnapshot): EntityGrowthPoint => ({
      date: s.date,
      counts: { ...s.counts },
      countsByType: cloneCountsByType(s.countsByType),
    });

    const days = RANGE_DAYS[range];
    const cutoff = daysBeforeIso(isoDate(new Date()), days);
    return snapshots.filter(s => s.date >= cutoff).map(toPoint);
  }

  // ---- Active users ---------------------------------------------------

  private activeUsers(events: RawEvent[]): ActiveUserSummary[] {
    const byUser = new Map<
      string,
      { first: number; last: number; count: number }
    >();
    for (const e of events) {
      const t = e.timestamp.getTime();
      const cur = byUser.get(e.userRef);
      if (!cur) {
        byUser.set(e.userRef, { first: t, last: t, count: 1 });
      } else {
        cur.count += 1;
        if (t < cur.first) cur.first = t;
        if (t > cur.last) cur.last = t;
      }
    }
    return [...byUser.entries()]
      .map(([userRef, v]) => ({
        userRef,
        firstSeen: new Date(v.first).toISOString(),
        lastSeen: new Date(v.last).toISOString(),
        eventCount: v.count,
      }))
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }

  // ---- Search ---------------------------------------------------------

  private searchAnalytics(
    events: RawEvent[],
    from: Date,
    to: Date,
  ): SearchAnalytics {
    const searchEvents = events.filter(e => e.action === 'search');

    const termMap = new Map<
      string,
      { count: number; users: Set<string>; last: number }
    >();
    for (const e of searchEvents) {
      const q = normaliseQuery(e.subject);
      // Skip empty / trivially short queries (< 2 chars) — they're
      // typically noise from live-typing search bars.
      if (q.length < 2) continue;
      const t = e.timestamp.getTime();
      const cur = termMap.get(q);
      if (!cur) {
        termMap.set(q, { count: 1, users: new Set([e.userRef]), last: t });
      } else {
        cur.count += 1;
        cur.users.add(e.userRef);
        if (t > cur.last) cur.last = t;
      }
    }

    const topTerms: SearchTermStat[] = [...termMap.entries()]
      .map(([query, v]) => ({
        query,
        count: v.count,
        users: v.users.size,
        lastSeen: new Date(v.last).toISOString(),
      }))
      .sort((a, b) => b.count - a.count)
      // Bounded so the payload stays cheap to serialise/cache while
      // still giving the UI something worth paginating.
      .slice(0, 25);

    // Daily volume covering every day in the window (zero-filled) so
    // the chart doesn't collapse gaps.
    const buckets = new Map<string, { searches: number; users: Set<string> }>();
    for (const day of eachDay(from, to)) {
      buckets.set(day, { searches: 0, users: new Set() });
    }
    for (const e of searchEvents) {
      const day = isoDate(e.timestamp);
      const b = buckets.get(day);
      if (!b) continue;
      b.searches += 1;
      b.users.add(e.userRef);
    }
    const volume: SearchVolumePoint[] = [...buckets.entries()].map(
      ([date, b]) => ({ date, searches: b.searches, users: b.users.size }),
    );

    return {
      total: searchEvents.length,
      topTerms,
      volume,
    };
  }

  // ---- Top entities ----------------------------------------------------

  private async topEntities(
    current: RawEvent[],
    previous: RawEvent[],
  ): Promise<TopEntityStat[]> {
    const currentCounts = countEntityViews(current);
    const previousCounts = countEntityViews(previous);

    const top = [...currentCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_ENTITIES_LIMIT);

    if (top.length === 0) return [];

    const enriched = await this.enrichEntities(top.map(([ref]) => ref));

    return top.map(([ref, views]) => {
      const parsed = safeParseRef(ref);
      const entity = enriched.get(ref.toLowerCase());
      const owner =
        (entity?.spec?.owner as string | undefined) ?? parsed.owner ?? null;
      const prev = previousCounts.get(ref) ?? 0;
      return {
        entityRef: ref,
        name: parsed.name,
        kind: entity?.kind ?? parsed.kind,
        owner,
        views,
        trendPct: prev === 0 ? null : pctChange(prev, views),
      };
    });
  }

  // ---- Top TechDocs sites ---------------------------------------------

  private async topDocs(
    current: RawEvent[],
    previous: RawEvent[],
  ): Promise<TechDocsSiteStat[]> {
    const currentStats = countDocsViews(current);
    const previousStats = countDocsViews(previous);

    const top = [...currentStats.entries()]
      .sort((a, b) => b[1].views - a[1].views || a[0].localeCompare(b[0]))
      .slice(0, TOP_DOCS_LIMIT);

    if (top.length === 0) return [];

    const enriched = await this.enrichEntities(top.map(([ref]) => ref));

    return top.map(([ref, v]) => {
      const parsed = safeParseRef(ref);
      const entity = enriched.get(ref.toLowerCase());
      const prev = previousStats.get(ref)?.views ?? 0;
      return {
        entityRef: ref,
        name: parsed.name,
        kind: entity?.kind ?? parsed.kind,
        owner:
          (entity?.spec?.owner as string | undefined) ?? parsed.owner ?? null,
        views: v.views,
        readers: v.users.size,
        pages: v.pages.size,
        trendPct: prev === 0 ? null : pctChange(prev, v.views),
      };
    });
  }

  /**
   * Resolves kind/owner for the given entity refs. Enrichment failures
   * are non-fatal: the tables fall back to the values parsed out of the
   * ref itself rather than dropping rows.
   */
  private async enrichEntities(refs: string[]): Promise<Map<string, Entity>> {
    const { catalog, auth, logger } = this.options;
    try {
      const credentials = await auth.getOwnServiceCredentials();
      const { items } = await catalog.getEntitiesByRefs(
        { entityRefs: refs, fields: ['kind', 'metadata.name', 'spec.owner'] },
        { credentials },
      );
      return new Map(
        items
          .filter((e): e is Entity => Boolean(e))
          .map(e => [stringifyEntityRef(e).toLowerCase(), e]),
      );
    } catch (err) {
      logger.warn(
        `adoption-analytics-backend: failed to enrich entities from catalog: ${
          (err as Error).message
        }`,
      );
      return new Map();
    }
  }

  // ---- Top pages -------------------------------------------------------

  private topPages(current: RawEvent[], previous: RawEvent[]): TopPageStat[] {
    const currentCounts = countPageViews(current);
    const previousCounts = countPageViews(previous);

    return (
      [...currentCounts.entries()]
        // Tie-break on the path so equally-viewed groups keep a stable
        // order between requests instead of shuffling with Map order.
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, TOP_PAGES_LIMIT)
        .map(([path, views]) => {
          const prev = previousCounts.get(path) ?? 0;
          return {
            path,
            views,
            trendPct: prev === 0 ? null : pctChange(prev, views),
          };
        })
    );
  }

  // ---- Plugin adoption -------------------------------------------------

  /**
   * Usage per plugin. Events without a `pluginId` are dropped rather
   * than bucketed as "unknown" — they come from captures that never set
   * an analytics context, so a catch-all row would name a plugin nobody
   * can act on.
   */
  private pluginAdoption(
    current: RawEvent[],
    previous: RawEvent[],
  ): PluginAdoptionStat[] {
    const previousCounts = countPluginEvents(previous);
    const byPlugin = new Map<
      string,
      { events: number; users: Set<string>; last: number }
    >();
    for (const e of current) {
      const pluginId = e.pluginId?.trim();
      if (!pluginId) continue;
      const t = e.timestamp.getTime();
      const cur = byPlugin.get(pluginId);
      if (!cur) {
        byPlugin.set(pluginId, {
          events: 1,
          users: new Set([e.userRef]),
          last: t,
        });
      } else {
        cur.events += 1;
        cur.users.add(e.userRef);
        if (t > cur.last) cur.last = t;
      }
    }

    return [...byPlugin.entries()]
      .sort((a, b) => b[1].events - a[1].events || a[0].localeCompare(b[0]))
      .slice(0, PLUGIN_ADOPTION_LIMIT)
      .map(([pluginId, v]) => {
        const prev = previousCounts.get(pluginId) ?? 0;
        return {
          pluginId,
          events: v.events,
          users: v.users.size,
          lastSeen: new Date(v.last).toISOString(),
          trendPct: prev === 0 ? null : pctChange(prev, v.events),
        };
      });
  }
}

// ---- Types the aggregator relies on ------------------------------------

type RawEvent = {
  userRef: string;
  action: string;
  subject: string;
  pluginId: string | null;
  pathname: string | null;
  sessionId: string | null;
  timestamp: Date;
  value: number | null;
};
// ---- Helpers -----------------------------------------------------------

function countEntityViews(events: RawEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.action !== 'navigate') continue;
    // Backstage's RouteTracker puts the target URL path in `subject`;
    // fall back to `pathname` in case a caller populated it explicitly.
    const path = extractPath(e.subject) ?? e.pathname;
    if (!path) continue;
    const ref = entityRefFromPath(path);
    if (!ref) continue;
    counts.set(ref, (counts.get(ref) ?? 0) + 1);
  }
  return counts;
}

/**
 * Returns `value` if it looks like a URL path (starts with `/`) so the
 * aggregator doesn't try to parse arbitrary `subject` strings — some
 * plugins send opaque labels rather than paths.
 */
function extractPath(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith('/') ? value : null;
}

function countPageViews(events: RawEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.action !== 'navigate') continue;
    const path = extractPath(e.subject) ?? e.pathname;
    if (!path) continue;
    const group = pageGroupFromPath(path);
    if (!group) continue;
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return counts;
}

function countPluginEvents(events: RawEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) {
    const pluginId = e.pluginId?.trim();
    if (!pluginId) continue;
    counts.set(pluginId, (counts.get(pluginId) ?? 0) + 1);
  }
  return counts;
}

type DocsSiteCounts = {
  views: number;
  users: Set<string>;
  pages: Set<string>;
};

function countDocsViews(events: RawEvent[]): Map<string, DocsSiteCounts> {
  const stats = new Map<string, DocsSiteCounts>();
  for (const e of events) {
    if (e.action !== 'navigate') continue;
    const path = extractPath(e.subject) ?? e.pathname;
    if (!path) continue;
    const site = docsSiteFromPath(path);
    if (!site) continue;
    let cur = stats.get(site.entityRef);
    if (!cur) {
      cur = { views: 0, users: new Set(), pages: new Set() };
      stats.set(site.entityRef, cur);
    }
    cur.views += 1;
    cur.users.add(e.userRef);
    cur.pages.add(site.page);
  }
  return stats;
}

/**
 * Splits a TechDocs pathname into the site's entity ref and the page
 * within it: `/docs/default/component/foo/getting-started/` yields
 * `component:default/foo` and `getting-started`. The site root maps to
 * the page `/`. Returns null for anything that isn't a docs path.
 */
export function docsSiteFromPath(
  pathname: string,
): { entityRef: string; page: string } | null {
  const clean = pathname.split(/[?#]/)[0].trim();
  if (!clean.startsWith('/')) return null;
  const parts = clean.split('/').filter(Boolean);
  if (parts.length < 4 || parts[0].toLowerCase() !== 'docs') return null;
  const [, namespace, kind, name, ...rest] = parts;
  return {
    entityRef: `${kind.toLowerCase()}:${namespace.toLowerCase()}/${name.toLowerCase()}`,
    page: rest.length === 0 ? '/' : rest.join('/').toLowerCase(),
  };
}

/**
 * Collapses a pathname to its first segment, e.g. `/docs/default/component/foo`
 * becomes `/docs` and `/` stays `/`. Returns null for values that aren't
 * paths at all.
 *
 * Query and hash are dropped rather than grouped on: some plugins put
 * free-text filters in the query string, and the dashboard should not
 * surface those as page names.
 */
export function pageGroupFromPath(pathname: string): string | null {
  const clean = pathname.split(/[?#]/)[0].trim().toLowerCase();
  if (!clean.startsWith('/')) return null;
  const [first] = clean.replace(/^\/+/, '').split('/');
  return first ? `/${first}` : '/';
}

/**
 * Best-effort extraction of an entity ref from a `/catalog/:namespace/:kind/:name`
 * style pathname. Returns null when the pathname doesn't point at an entity page.
 */
export function entityRefFromPath(pathname: string): string | null {
  // Trim query/hash and leading slash.
  const clean = pathname.split(/[?#]/)[0].replace(/^\/+/, '');
  const parts = clean.split('/');
  if (parts.length < 4 || parts[0] !== 'catalog') return null;
  const [, namespace, kind, name] = parts;
  if (!namespace || !kind || !name) return null;
  return `${kind.toLowerCase()}:${namespace.toLowerCase()}/${name.toLowerCase()}`;
}

function safeParseRef(ref: string): {
  kind: string;
  name: string;
  owner: string | null;
} {
  try {
    const parsed = parseEntityRef(ref);
    return { kind: parsed.kind, name: parsed.name, owner: null };
  } catch {
    return { kind: 'unknown', name: ref, owner: null };
  }
}

function uniqueUsersOnDay(events: RawEvent[], iso: string): number {
  const users = new Set<string>();
  for (const e of events) {
    if (isoDate(e.timestamp) === iso) users.add(e.userRef);
  }
  return users.size;
}

/**
 * Counts distinct user refs across the given events. Callers are
 * expected to pre-filter to the intended window — the earlier version
 * (`rollingActiveUsers`) re-filtered by `now - N days` internally,
 * which silently discarded every event in the previous-period window
 * and made WAU baselines always look like zero.
 */
function distinctUsers(events: RawEvent[]): number {
  if (events.length === 0) return 0;
  const users = new Set<string>();
  for (const e of events) users.add(e.userRef);
  return users.size;
}

/**
 * Fallback session-timeout for events that don't carry a client-assigned
 * `sessionId` — used only for legacy rows recorded before the sessionId
 * column was added.
 */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function averageSessionMinutes(events: RawEvent[]): number {
  // For events with a real client-generated `sessionId`, group by that
  // — it's the accurate boundary. For older events without one, fall
  // back to the 30-minute gap heuristic so historical data still works.
  //
  // Zero-duration sessions (a single-event session) are dropped from
  // the average so a hit-and-leave visit doesn't drag the metric down.
  const withSession: RawEvent[] = [];
  const withoutSession: RawEvent[] = [];
  for (const e of events) {
    if (e.sessionId) withSession.push(e);
    else withoutSession.push(e);
  }

  const durations: number[] = [];

  // Client-tracked sessions: session = distinct (userRef, sessionId).
  const bySession = new Map<string, { min: number; max: number }>();
  for (const e of withSession) {
    const key = `${e.userRef}|${e.sessionId}`;
    const t = e.timestamp.getTime();
    const cur = bySession.get(key);
    if (!cur) bySession.set(key, { min: t, max: t });
    else {
      if (t < cur.min) cur.min = t;
      if (t > cur.max) cur.max = t;
    }
  }
  for (const { min, max } of bySession.values()) {
    pushDuration(durations, max - min);
  }

  // Legacy rows: 30-min inactivity gap defines a session.
  const perUser = new Map<string, number[]>();
  for (const e of withoutSession) {
    const arr = perUser.get(e.userRef);
    if (arr) arr.push(e.timestamp.getTime());
    else perUser.set(e.userRef, [e.timestamp.getTime()]);
  }
  for (const timestamps of perUser.values()) {
    timestamps.sort((a, b) => a - b);
    let sessionStart = timestamps[0];
    let sessionEnd = timestamps[0];
    for (let i = 1; i < timestamps.length; i++) {
      const t = timestamps[i];
      if (t - sessionEnd > SESSION_TIMEOUT_MS) {
        pushDuration(durations, sessionEnd - sessionStart);
        sessionStart = t;
      }
      sessionEnd = t;
    }
    pushDuration(durations, sessionEnd - sessionStart);
  }

  if (durations.length === 0) return 0;
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  return Math.round(avg * 10) / 10;
}

function pushDuration(durations: number[], deltaMs: number): void {
  const minutes = deltaMs / 60_000;
  if (minutes > 0) durations.push(minutes);
}

function pctChange(prev: number, next: number): number {
  if (prev === 0) return next === 0 ? 0 : 100;
  return Math.round(((next - prev) / prev) * 1000) / 10;
}

/**
 * Normalises a search query so `React`, `react`, `  REACT  ` all
 * collapse into the same bucket, and caps the length so a huge paste
 * can't blow up the aggregation memory.
 */
function normaliseQuery(subject: string): string {
  return subject.trim().toLowerCase().slice(0, 128);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBefore(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() - days);
  return out;
}

function daysBeforeIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return isoDate(d);
}

function cloneCountsByType(
  src: Record<string, Record<string, number>> | undefined,
): Record<string, Record<string, number>> | undefined {
  if (!src) return undefined;
  const out: Record<string, Record<string, number>> = {};
  for (const [kind, typeMap] of Object.entries(src)) {
    out[kind] = { ...typeMap };
  }
  return out;
}

function* eachDay(from: Date, to: Date): Generator<string> {
  const cur = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );
  while (cur <= end) {
    yield isoDate(cur);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}
