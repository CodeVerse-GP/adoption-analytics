import type {
  CacheService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import {
  mockCredentials,
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  adoptionAnalyticsPageViewPermission,
  adoptionAnalyticsUsersReadPermission,
} from '@codeverse-gp/plugin-adoption-analytics-common';
import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import type { EventsQueue } from './service/EventsQueue';
import type { AdoptionAnalyticsDashboardService } from './service/AdoptionAnalyticsDashboardService';
import type { AdoptionAnalyticsDatabase } from './service/AdoptionAnalyticsDatabase';

function makeDbMock(): jest.Mocked<AdoptionAnalyticsDatabase> {
  return {
    recordEvents: jest.fn().mockResolvedValue(undefined),
    upsertEntitySnapshot: jest.fn().mockResolvedValue(undefined),
    getEntityCountSnapshots: jest.fn().mockResolvedValue([]),
    getActiveUsers: jest
      .fn()
      .mockResolvedValue({ window: 'daily', points: [] }),
    getRecentLogins: jest.fn().mockResolvedValue([]),
    getRawEvents: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<AdoptionAnalyticsDatabase>;
}

function makeDashboardMock(): jest.Mocked<AdoptionAnalyticsDashboardService> {
  return {
    getDashboard: jest.fn().mockResolvedValue({
      range: '30d',
      generatedAt: '2026-07-23T10:00:00.000Z',
      kpis: {
        totalEntities: { value: 0, deltaPct: null },
        dau: { value: 0, deltaPct: null },
        wau: { value: 0, deltaPct: null },
        avgSessionMinutes: { value: 0, deltaPct: null },
      },
      dau: { window: 'daily', points: [] },
      wauSessions: [],
      entityGrowth: [],
      topEntities: [],
      topPages: [],
      // Non-empty so masking tests have something to inspect.
      activeUsers: [
        {
          userRef: 'user:default/alice',
          firstSeen: '2026-07-23T00:00:00.000Z',
          lastSeen: '2026-07-23T10:00:00.000Z',
          eventCount: 5,
        },
      ],
      search: { total: 0, topTerms: [], volume: [] },
    }),
    getSharedKpis: jest.fn().mockResolvedValue({
      dau: { value: 0, deltaPct: null },
      wau: { value: 0, deltaPct: null },
      avgSessionMinutes: { value: 0, deltaPct: null },
    }),
  } as unknown as jest.Mocked<AdoptionAnalyticsDashboardService>;
}

/**
 * `mockServices.cache.mock()` returns jest.fn() stubs that don't actually
 * remember values, so the caching behavior of the router can't be
 * exercised against it. A tiny in-memory Map is enough for these tests.
 */
function makeCacheStub(): CacheService {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    withOptions: jest.fn(),
  } as unknown as CacheService;
}

function makeQueueMock(): jest.Mocked<EventsQueue> {
  return {
    push: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
    size: jest.fn().mockReturnValue(0),
  } as unknown as jest.Mocked<EventsQueue>;
}

/**
 * Permission mock that answers each query based on which permission it
 * names. The router asks two independent questions — may this caller
 * open the dashboard at all (`page.view`), and may they see raw user
 * refs (`users.read`) — so a mock returning one blanket decision would
 * make it impossible to test them apart.
 */
function makePermissionsMock(
  options: {
    pageView?: AuthorizeResult;
    usersRead?: AuthorizeResult;
    /** Simulates a broken permission backend for the masking check. */
    failUsersRead?: boolean;
  } = {},
): jest.Mocked<PermissionsService> {
  const {
    pageView = AuthorizeResult.ALLOW,
    usersRead = AuthorizeResult.DENY,
    failUsersRead = false,
  } = options;

  const decide = async (queries: Array<{ permission: { name: string } }>) => {
    const namesUsersRead = queries.some(
      q => q.permission.name === adoptionAnalyticsUsersReadPermission.name,
    );
    if (namesUsersRead && failUsersRead) {
      throw new Error('unavailable');
    }
    return queries.map(q => ({
      result:
        q.permission.name === adoptionAnalyticsPageViewPermission.name
          ? pageView
          : usersRead,
    }));
  };

  return {
    authorize: jest.fn(decide),
    authorizeConditional: jest.fn(decide),
  } as unknown as jest.Mocked<PermissionsService>;
}

describe('createRouter', () => {
  let app: express.Express;
  let db: jest.Mocked<AdoptionAnalyticsDatabase>;
  let dashboard: jest.Mocked<AdoptionAnalyticsDashboardService>;
  let eventsQueue: jest.Mocked<EventsQueue>;
  let permissions: jest.Mocked<PermissionsService>;

  async function mountRouter(
    permissionOptions: Parameters<typeof makePermissionsMock>[0] = {},
  ): Promise<express.Express> {
    db = makeDbMock();
    dashboard = makeDashboardMock();
    eventsQueue = makeQueueMock();
    permissions = makePermissionsMock(permissionOptions);
    const router = await createRouter({
      logger: mockServices.logger.mock(),
      db,
      dashboard,
      httpAuth: mockServices.httpAuth(),
      userInfo: mockServices.userInfo(),
      cache: makeCacheStub(),
      eventsQueue,
      permissions,
      maskSalt: 'test-salt',
    });
    return express().use(router).use(mockErrorHandler());
  }

  beforeEach(async () => {
    app = await mountRouter();
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('POST /events', () => {
    it('rejects malformed payloads with 400', async () => {
      const res = await request(app)
        .post('/events')
        .set('Authorization', mockCredentials.user.header())
        .send({ events: [{}] });
      expect(res.status).toBe(400);
      expect(eventsQueue.push).not.toHaveBeenCalled();
    });

    it('rejects an empty batch with 400', async () => {
      const res = await request(app)
        .post('/events')
        .set('Authorization', mockCredentials.user.header())
        .send({ events: [] });
      expect(res.status).toBe(400);
      expect(eventsQueue.push).not.toHaveBeenCalled();
    });

    it('rejects a non-ISO timestamp with 400', async () => {
      const res = await request(app)
        .post('/events')
        .set('Authorization', mockCredentials.user.header())
        .send({
          events: [
            {
              action: 'navigate',
              subject: '/catalog',
              timestamp: 'not-a-date',
            },
          ],
        });
      expect(res.status).toBe(400);
      expect(eventsQueue.push).not.toHaveBeenCalled();
    });

    it('enqueues valid events and stamps the user ref from userInfo', async () => {
      const res = await request(app)
        .post('/events')
        .set('Authorization', mockCredentials.user.header())
        .send({
          events: [
            {
              action: 'navigate',
              subject: '/catalog',
              pluginId: 'catalog',
              sessionId: 'test-session-1',
              timestamp: '2026-07-23T10:00:00.000Z',
            },
          ],
        });

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ accepted: 1 });
      expect(eventsQueue.push).toHaveBeenCalledTimes(1);
      expect(eventsQueue.push).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'navigate',
          subject: '/catalog',
          sessionId: 'test-session-1',
          userRef: expect.stringContaining(':'),
        }),
      );
      // Router must never touch the DB directly on the request path
      // anymore — that's the whole point of the queue.
      expect(db.recordEvents).not.toHaveBeenCalled();
    });
  });

  describe('GET /stats/active-users', () => {
    it('defaults to daily window and 30 days', async () => {
      const res = await request(app).get('/stats/active-users');
      expect(res.status).toBe(200);
      expect(db.getActiveUsers).toHaveBeenCalledWith('daily', 30);
    });

    it('rejects an unknown window with 400', async () => {
      const res = await request(app).get('/stats/active-users?window=hourly');
      expect(res.status).toBe(400);
      expect(db.getActiveUsers).not.toHaveBeenCalled();
    });

    it('accepts the weekly window', async () => {
      const res = await request(app).get(
        '/stats/active-users?window=weekly&days=7',
      );
      expect(res.status).toBe(200);
      expect(db.getActiveUsers).toHaveBeenCalledWith('weekly', 7);
    });
  });

  describe('GET /stats/entity-counts', () => {
    it('defaults days to 30', async () => {
      const res = await request(app).get('/stats/entity-counts');
      expect(res.status).toBe(200);
      expect(db.getEntityCountSnapshots).toHaveBeenCalledWith(30);
    });

    it('rejects days above the cap with 400', async () => {
      const res = await request(app).get('/stats/entity-counts?days=9999');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /stats/logins', () => {
    it('defaults limit to 50', async () => {
      const res = await request(app).get('/stats/logins');
      expect(res.status).toBe(200);
      expect(db.getRecentLogins).toHaveBeenCalledWith(50);
    });

    it('rejects non-numeric limit with 400', async () => {
      const res = await request(app).get('/stats/logins?limit=abc');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /stats/dashboard', () => {
    it('defaults range to 30d', async () => {
      const res = await request(app).get('/stats/dashboard');
      expect(res.status).toBe(200);
      expect(dashboard.getDashboard).toHaveBeenCalledWith('30d');
    });

    it('accepts the 90d range', async () => {
      const res = await request(app).get('/stats/dashboard?range=90d');
      expect(res.status).toBe(200);
      expect(dashboard.getDashboard).toHaveBeenCalledWith('90d');
    });

    it('rejects an unknown range with 400', async () => {
      const res = await request(app).get('/stats/dashboard?range=12w');
      expect(res.status).toBe(400);
      expect(dashboard.getDashboard).not.toHaveBeenCalled();
    });

    it('serves a second identical request from cache', async () => {
      // First call misses the cache and hits the aggregator.
      const first = await request(app).get('/stats/dashboard?range=7d');
      expect(first.status).toBe(200);
      expect(dashboard.getDashboard).toHaveBeenCalledTimes(1);

      // Second call must be served from cache; aggregator must not be
      // invoked again — this is the whole point of Tier 1 caching.
      const second = await request(app).get('/stats/dashboard?range=7d');
      expect(second.status).toBe(200);
      expect(dashboard.getDashboard).toHaveBeenCalledTimes(1);
    });

    it('caches per range independently', async () => {
      await request(app).get('/stats/dashboard?range=7d');
      await request(app).get('/stats/dashboard?range=30d');
      // Different ranges must not share a cache slot.
      expect(dashboard.getDashboard).toHaveBeenCalledTimes(2);
      expect(dashboard.getDashboard).toHaveBeenNthCalledWith(1, '7d');
      expect(dashboard.getDashboard).toHaveBeenNthCalledWith(2, '30d');
    });

    it('shares one cache entry for the range-independent KPIs', async () => {
      // Each range gets its own payload entry, but the dau/wau/session
      // cards must come from a single shared entry — otherwise each tab
      // computes them at a different moment and the same card reports
      // different numbers depending on which range was opened first.
      await request(app).get('/stats/dashboard?range=7d');
      await request(app).get('/stats/dashboard?range=30d');
      await request(app).get('/stats/dashboard?range=90d');

      expect(dashboard.getDashboard).toHaveBeenCalledTimes(3);
      expect(dashboard.getSharedKpis).toHaveBeenCalledTimes(1);
    });

    it('serves identical dau/wau/session KPIs on every range', async () => {
      // The per-range payload carries a stale KPI block; the shared entry
      // must win so the cards agree across tabs.
      dashboard.getSharedKpis.mockResolvedValue({
        dau: { value: 1, deltaPct: -66.7 },
        wau: { value: 4, deltaPct: 300 },
        avgSessionMinutes: { value: 62.7, deltaPct: 94.7 },
      });

      const bodies = [];
      for (const range of ['7d', '30d', '90d']) {
        const res = await request(app).get(`/stats/dashboard?range=${range}`);
        expect(res.status).toBe(200);
        bodies.push(res.body.kpis);
      }

      for (const kpis of bodies) {
        expect(kpis.dau).toEqual({ value: 1, deltaPct: -66.7 });
        expect(kpis.wau).toEqual({ value: 4, deltaPct: 300 });
        expect(kpis.avgSessionMinutes).toEqual({ value: 62.7, deltaPct: 94.7 });
      }
      // Total Entities is range-scoped by design and still comes from the
      // per-range payload.
      expect(bodies[0].totalEntities).toEqual({ value: 0, deltaPct: null });
    });

    it('masks user refs when the permission check denies', async () => {
      // Default `mountRouter` returns DENY — mask expected.
      const res = await request(app).get('/stats/dashboard');
      expect(res.status).toBe(200);
      const body = res.body as { activeUsers: Array<{ userRef: string }> };
      expect(body.activeUsers[0].userRef).toMatch(/^user:masked\/[0-9a-f]{8}$/);
      expect(body.activeUsers[0].userRef).not.toBe('user:default/alice');
      // Same input + same salt → deterministic pseudonym.
      const second = await request(app).get('/stats/dashboard');
      expect(second.body.activeUsers[0].userRef).toBe(
        body.activeUsers[0].userRef,
      );
    });

    it('leaves user refs untouched when the permission check allows', async () => {
      app = await mountRouter({ usersRead: AuthorizeResult.ALLOW });
      const res = await request(app).get('/stats/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.activeUsers[0].userRef).toBe('user:default/alice');
    });

    it('falls back to masking if the permission backend throws', async () => {
      // Simulate a broken permission backend — identity must not leak.
      app = await mountRouter({ failUsersRead: true });
      const res = await request(app).get('/stats/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.activeUsers[0].userRef).toMatch(
        /^user:masked\/[0-9a-f]{8}$/,
      );
    });
  });

  describe('adoption-analytics.page.view gate', () => {
    it.each([
      '/stats/dashboard',
      '/stats/active-users',
      '/stats/entity-counts',
      '/stats/logins',
    ])('rejects %s with 403 when the page view is denied', async path => {
      app = await mountRouter({ pageView: AuthorizeResult.DENY });
      const res = await request(app).get(path);
      expect(res.status).toBe(403);
    });

    it('does not reach the aggregator when the page view is denied', async () => {
      app = await mountRouter({ pageView: AuthorizeResult.DENY });
      await request(app).get('/stats/dashboard');
      expect(dashboard.getDashboard).not.toHaveBeenCalled();
    });

    it('still accepts event ingest when the page view is denied', async () => {
      // Collection must keep working for users who cannot read the
      // dashboard, otherwise restricting access silently stops the
      // metrics from being gathered in the first place.
      app = await mountRouter({ pageView: AuthorizeResult.DENY });
      const res = await request(app)
        .post('/events')
        .set('Authorization', mockCredentials.user.header())
        .send({
          events: [
            {
              action: 'navigate',
              subject: '/catalog',
              timestamp: '2026-07-23T10:00:00.000Z',
            },
          ],
        });
      expect(res.status).toBe(202);
      expect(eventsQueue.push).toHaveBeenCalledTimes(1);
    });

    it('leaves /health reachable when the page view is denied', async () => {
      app = await mountRouter({ pageView: AuthorizeResult.DENY });
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });
  });
});
