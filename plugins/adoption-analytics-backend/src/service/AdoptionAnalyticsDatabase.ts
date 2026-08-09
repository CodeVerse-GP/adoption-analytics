import type {
  DatabaseService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { resolvePackagePath } from '@backstage/backend-plugin-api';
import type {
  ActiveUsersSummary,
  EntityCountSnapshot,
  AdoptionAnalyticsEvent,
  LoginEvent,
} from '@codeverse-gp/plugin-adoption-analytics-common';
import { ADOPTION_ANALYTICS_EVENT_ACTIONS } from '@codeverse-gp/plugin-adoption-analytics-common';
import type { Knex } from 'knex';

const migrationsDir = resolvePackagePath(
  '@codeverse-gp/plugin-adoption-analytics-backend',
  'migrations',
);

type Options = {
  database: DatabaseService;
  logger: LoggerService;
};

export type PersistedEvent = AdoptionAnalyticsEvent & { userRef: string };

type EventRow = {
  user_ref: string;
  action: string;
  subject: string;
  plugin_id: string | null;
  pathname: string | null;
  session_id: string | null;
  value: number | null;
  timestamp: Date | string;
};

type SnapshotRow = {
  date: string;
  kind: string;
  type: string;
  count: number;
};

/**
 * Input row for `upsertEntitySnapshot`. `type` is the raw `spec.type`
 * value, or the empty string when an entity has no type.
 */
export type EntityCountRow = {
  kind: string;
  type: string;
  count: number;
};

/**
 * Persistence layer for adoption analytics events and daily entity-count snapshots.
 * Kept intentionally small — aggregations live here so the router stays thin.
 */
export class AdoptionAnalyticsDatabase {
  static async create(options: Options): Promise<AdoptionAnalyticsDatabase> {
    const { database, logger } = options;
    const client = await database.getClient();
    if (!database.migrations?.skip) {
      logger.info('adoption-analytics-backend: running migrations');
      await client.migrate.latest({ directory: migrationsDir });
    }
    return new AdoptionAnalyticsDatabase(client);
  }

  private constructor(private readonly db: Knex) {}

  async recordEvents(events: PersistedEvent[]): Promise<void> {
    if (events.length === 0) return;
    const rows: EventRow[] = events.map(e => ({
      user_ref: e.userRef,
      action: e.action,
      subject: e.subject,
      plugin_id: e.pluginId ?? null,
      pathname: e.pathname ?? null,
      session_id: e.sessionId ?? null,
      value: e.value ?? null,
      timestamp: new Date(e.timestamp),
    }));
    await this.db('insights_events').insert(rows);
  }

  async upsertEntitySnapshot(
    date: string,
    rows: EntityCountRow[],
  ): Promise<void> {
    if (rows.length === 0) return;
    const dbRows: SnapshotRow[] = rows.map(r => ({
      date,
      kind: r.kind,
      type: r.type,
      count: r.count,
    }));
    // Use manual upsert so this works on both SQLite and Postgres without
    // depending on dialect-specific `.onConflict()` behavior.
    await this.db.transaction(async trx => {
      await trx('insights_entity_snapshots').where({ date }).del();
      await trx('insights_entity_snapshots').insert(dbRows);
    });
  }

  async getEntityCountSnapshots(days: number): Promise<EntityCountSnapshot[]> {
    const since = isoDate(daysAgo(days));
    const rows = await this.db('insights_entity_snapshots')
      .select('date', 'kind', 'type', 'count')
      .where('date', '>=', since)
      .orderBy('date', 'asc');

    const byDate = new Map<string, EntityCountSnapshot>();
    for (const row of rows as SnapshotRow[]) {
      let snap = byDate.get(row.date);
      if (!snap) {
        snap = { date: row.date, counts: {}, countsByType: {}, total: 0 };
        byDate.set(row.date, snap);
      }
      // Per-kind aggregate (backwards-compatible)
      snap.counts[row.kind] = (snap.counts[row.kind] ?? 0) + row.count;
      snap.total += row.count;
      // Per-kind + per-type breakdown
      if (!snap.countsByType) snap.countsByType = {};
      if (!snap.countsByType[row.kind]) snap.countsByType[row.kind] = {};
      snap.countsByType[row.kind][row.type] = row.count;
    }
    return Array.from(byDate.values());
  }

  /**
   * Date (YYYY-MM-DD) of each user's first-ever event across all retained
   * history. Needed to tell new users from returning ones: a windowed
   * scan alone would label anyone whose first event lands in the window
   * as new, even if they had been active for months before it.
   */
  async getFirstSeenByUser(): Promise<Map<string, string>> {
    const rows = (await this.db('insights_events')
      .select('user_ref')
      .min({ first_seen: 'timestamp' })
      .groupBy('user_ref')) as Array<{
      user_ref: string;
      first_seen: Date | string | number;
    }>;
    return new Map(
      rows.map(r => [r.user_ref, isoDate(new Date(r.first_seen))]),
    );
  }

  async getActiveUsers(
    window: 'daily' | 'weekly',
    days: number,
  ): Promise<ActiveUsersSummary> {
    const since = daysAgo(days);
    const rows = (await this.db('insights_events')
      .select('user_ref', 'timestamp')
      .where('timestamp', '>=', since)) as Array<{
      user_ref: string;
      timestamp: Date | string;
    }>;
    const firstSeen = await this.getFirstSeenByUser();

    // Bucket per user per day, then aggregate to the requested window.
    // Doing this in JS keeps the query portable across SQLite/Postgres.
    const dailyBuckets = new Map<string, Set<string>>();
    for (const row of rows) {
      const day = isoDate(new Date(row.timestamp));
      const set = dailyBuckets.get(day) ?? new Set<string>();
      set.add(row.user_ref);
      dailyBuckets.set(day, set);
    }

    const points: ActiveUsersSummary['points'] = [];
    if (window === 'daily') {
      for (const [date, users] of [...dailyBuckets.entries()].sort()) {
        points.push(splitNewReturning(date, date, users, firstSeen));
      }
    } else {
      // Rolling 7-day window ending on each day that has any activity.
      const sortedDays = [...dailyBuckets.keys()].sort();
      for (const day of sortedDays) {
        const windowStart = daysAgoFromIso(day, 6);
        const users = new Set<string>();
        for (const [d, us] of dailyBuckets) {
          if (d >= windowStart && d <= day) {
            for (const u of us) users.add(u);
          }
        }
        points.push(splitNewReturning(day, windowStart, users, firstSeen));
      }
    }
    return { window, points };
  }

  async getRecentLogins(limit: number): Promise<LoginEvent[]> {
    const rows = (await this.db('insights_events')
      .select('user_ref', 'timestamp')
      .where('action', ADOPTION_ANALYTICS_EVENT_ACTIONS.signIn)
      .orderBy('timestamp', 'desc')
      .limit(limit)) as Array<{ user_ref: string; timestamp: Date | string }>;

    return rows.map(r => ({
      userRef: r.user_ref,
      timestamp: new Date(r.timestamp).toISOString(),
    }));
  }

  /**
   * Returns raw event rows for the last `days` days. Used by the dashboard
   * aggregator which does its bucketing in JS to stay portable across
   * SQLite / Postgres.
   */
  async getRawEvents(days: number): Promise<
    Array<{
      userRef: string;
      action: string;
      subject: string;
      pluginId: string | null;
      pathname: string | null;
      sessionId: string | null;
      value: number | null;
      timestamp: Date;
    }>
  > {
    const since = daysAgo(days);
    const rows = (await this.db('insights_events')
      .select(
        'user_ref',
        'action',
        'subject',
        'plugin_id',
        'pathname',
        'session_id',
        'value',
        'timestamp',
      )
      .where('timestamp', '>=', since)) as Array<{
      user_ref: string;
      action: string;
      subject: string;
      plugin_id: string | null;
      pathname: string | null;
      session_id: string | null;
      value: number | null;
      timestamp: Date | string;
    }>;

    return rows.map(r => ({
      userRef: r.user_ref,
      action: r.action,
      subject: r.subject,
      pluginId: r.plugin_id,
      pathname: r.pathname,
      sessionId: r.session_id,
      value: r.value,
      timestamp: new Date(r.timestamp),
    }));
  }

  /**
   * Deletes events older than the given number of days. Returns the row
   * count for logging so the scheduled retention task can report what
   * it pruned.
   */
  async deleteEventsOlderThan(days: number): Promise<number> {
    const cutoff = daysAgo(days);
    return this.db('insights_events').where('timestamp', '<', cutoff).del();
  }
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgoFromIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return isoDate(d);
}

/**
 * Splits a bucket's active users into first-timers and returners. A user
 * is new when their first-ever event date falls inside [from, to] —
 * users missing from the map are treated as new so a bucket's parts
 * always add up to its total.
 */
function splitNewReturning(
  date: string,
  from: string,
  users: Set<string>,
  firstSeen: Map<string, string>,
): ActiveUsersSummary['points'][number] {
  let newUsers = 0;
  for (const user of users) {
    const first = firstSeen.get(user);
    if (first === undefined || (first >= from && first <= date)) newUsers += 1;
  }
  return {
    date,
    activeUsers: users.size,
    newUsers,
    returningUsers: users.size - newUsers,
  };
}
