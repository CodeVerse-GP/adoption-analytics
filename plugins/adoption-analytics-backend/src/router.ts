import type {
  CacheService,
  HttpAuthService,
  LoggerService,
  PermissionsService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { InputError, NotAllowedError } from '@backstage/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  adoptionAnalyticsPageViewPermission,
  adoptionAnalyticsUsersReadPermission,
  type AdoptionAnalyticsDashboard,
} from '@codeverse-gp/plugin-adoption-analytics-common';
import express from 'express';
import Router from 'express-promise-router';
import type { EventsQueue } from './service/EventsQueue';
import type {
  AdoptionAnalyticsDashboardService,
  SharedKpis,
} from './service/AdoptionAnalyticsDashboardService';
import type { AdoptionAnalyticsDatabase } from './service/AdoptionAnalyticsDatabase';
import { maskUserRef } from './service/mask';
import {
  activeUsersQuerySchema,
  dashboardQuerySchema,
  entityCountsQuerySchema,
  adoptionAnalyticsEventBatchSchema,
  recentLoginsQuerySchema,
} from './validation';

/**
 * TTL for cached `GET /stats/dashboard` responses. Sized so that a burst
 * of concurrent dashboard opens produces one aggregation followed by
 * cache hits, while never serving staler data than the snapshot cadence.
 */
const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Cache key for the range-independent KPI block. Deliberately not keyed
 * by range: those cards mean the same thing on every tab, so they must
 * come from one entry to stay consistent across tabs.
 */
const SHARED_KPI_CACHE_KEY = 'dashboard:shared-kpis';

export type RouterOptions = {
  logger: LoggerService;
  db: AdoptionAnalyticsDatabase;
  dashboard: AdoptionAnalyticsDashboardService;
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  cache: CacheService;
  eventsQueue: EventsQueue;
  permissions: PermissionsService;
  /** Optional salt for user-ref pseudonymisation. */
  maskSalt?: string;
};

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const {
    logger,
    db,
    dashboard,
    httpAuth,
    userInfo,
    cache,
    eventsQueue,
    permissions,
    maskSalt,
  } = options;

  const router = Router();
  router.use(express.json({ limit: '256kb' }));

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ---- Ingest ----------------------------------------------------------
  router.post('/events', async (req, res) => {
    const parsed = adoptionAnalyticsEventBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(
        `Invalid adoption analytics event payload: ${parsed.error.message}`,
      );
    }

    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const info = await userInfo.getUserInfo(credentials);
    const userRef = info.userEntityRef;

    // Push events onto the in-process queue and return immediately —
    // actual DB inserts happen off the request path, serialised by a
    // fastq worker. See EventsQueue.ts for the flush model.
    for (const event of parsed.data.events) {
      eventsQueue.push({ ...event, userRef });
    }
    res.status(202).json({ accepted: parsed.data.events.length });
  });

  // ---- Read gate -------------------------------------------------------
  // Every `/stats` route is dashboard data, so the check lives in one
  // middleware rather than in each handler — a new read route is then
  // protected by default instead of by remembering to add a check.
  //
  // Note this deliberately does not cover `POST /events`: ingest runs
  // for every signed-in user, and gating it would silently stop
  // collecting data for anyone outside the viewer allowlist.
  //
  // Unlike the masking check below, failures here are not swallowed. If
  // we cannot establish that the caller is authorized we must not serve
  // the data, so the error propagates instead of defaulting to allow.
  router.use('/stats', async (req, _res, next) => {
    const credentials = await httpAuth.credentials(req);
    const [decision] = await permissions.authorize(
      [{ permission: adoptionAnalyticsPageViewPermission }],
      { credentials },
    );
    if (decision.result !== AuthorizeResult.ALLOW) {
      throw new NotAllowedError(
        'You are not authorized to view Backstage adoption analytics.',
      );
    }
    next();
  });

  // ---- Read: entity counts over time ----------------------------------
  router.get('/stats/entity-counts', async (req, res) => {
    const parsed = entityCountsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(
        `Invalid entity-counts query: ${parsed.error.message}`,
      );
    }
    const snapshots = await db.getEntityCountSnapshots(parsed.data.days);
    res.json({ snapshots });
  });

  // ---- Read: DAU / WAU ------------------------------------------------
  router.get('/stats/active-users', async (req, res) => {
    const parsed = activeUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(
        `Invalid active-users query: ${parsed.error.message}`,
      );
    }
    const summary = await db.getActiveUsers(
      parsed.data.window,
      parsed.data.days,
    );
    res.json(summary);
  });

  // ---- Read: recent logins --------------------------------------------
  router.get('/stats/logins', async (req, res) => {
    const parsed = recentLoginsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(`Invalid logins query: ${parsed.error.message}`);
    }
    const logins = await db.getRecentLogins(parsed.data.limit);
    res.json({ logins });
  });

  // ---- Read: full dashboard payload -----------------------------------
  router.get('/stats/dashboard', async (req, res) => {
    const parsed = dashboardQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(`Invalid dashboard query: ${parsed.error.message}`);
    }
    const range = parsed.data.range;
    const cacheKey = `dashboard:${range}`;

    // Decide whether this caller is allowed to see raw user refs.
    // Default is DENY (mask) so a fresh install is GDPR-safe without
    // requiring a policy tweak. Admins grant `adoption-analytics.users.read` to
    // opt users into the unmasked view.
    const credentials = await httpAuth.credentials(req);
    let allowUnmask = false;
    try {
      const [decision] = await permissions.authorize(
        [{ permission: adoptionAnalyticsUsersReadPermission }],
        { credentials },
      );
      allowUnmask = decision.result === AuthorizeResult.ALLOW;
    } catch (err) {
      // A misconfigured or unavailable permission backend must never
      // leak identities — treat as "deny" and log.
      logger.warn(
        `adoption-analytics-backend: permission check failed, defaulting to masked: ${
          (err as Error).message
        }`,
      );
    }

    // Cache the unmasked payload once per range; apply the mask per
    // request so a single cache entry serves both permission variants.
    let unmaskedPayload: AdoptionAnalyticsDashboard;
    const cached = await cache.get<string>(cacheKey);
    if (cached) {
      unmaskedPayload = JSON.parse(cached) as AdoptionAnalyticsDashboard;
    } else {
      unmaskedPayload = await dashboard.getDashboard(range);
      await cache.set(cacheKey, JSON.stringify(unmaskedPayload), {
        ttl: DASHBOARD_CACHE_TTL_MS,
      });
    }

    // The DAU / WAU / session-length cards describe "right now" and are
    // identical for every range, so they get one cache entry shared by
    // all of them. Left inside the per-range entry they would be
    // computed once per tab at different moments, and the same card
    // would then report different numbers depending on which range
    // happened to be cached first.
    let sharedKpis: SharedKpis;
    const cachedKpis = await cache.get<string>(SHARED_KPI_CACHE_KEY);
    if (cachedKpis) {
      sharedKpis = JSON.parse(cachedKpis) as SharedKpis;
    } else {
      sharedKpis = await dashboard.getSharedKpis();
      await cache.set(SHARED_KPI_CACHE_KEY, JSON.stringify(sharedKpis), {
        ttl: DASHBOARD_CACHE_TTL_MS,
      });
    }

    const payload: AdoptionAnalyticsDashboard = {
      ...unmaskedPayload,
      kpis: { ...unmaskedPayload.kpis, ...sharedKpis },
    };

    res.json(allowUnmask ? payload : applyUserMask(payload, maskSalt));
  });

  logger.info('adoption-analytics-backend: router ready');
  return router;
}

/**
 * Returns a copy of the dashboard with user refs replaced by stable
 * pseudonyms. Only the `activeUsers` list exposes raw user identities
 * today — other widgets (KPIs, entity refs, search queries) don't need
 * masking. Extend this function if new user-identifying fields are
 * added to the payload.
 */
function applyUserMask(
  payload: AdoptionAnalyticsDashboard,
  salt: string | undefined,
): AdoptionAnalyticsDashboard {
  return {
    ...payload,
    activeUsers: payload.activeUsers.map(u => ({
      ...u,
      userRef: maskUserRef(u.userRef, salt),
    })),
  };
}
