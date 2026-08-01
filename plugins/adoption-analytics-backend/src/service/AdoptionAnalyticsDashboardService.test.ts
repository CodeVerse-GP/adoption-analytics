import { mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import {
  AdoptionAnalyticsDashboardService,
  pageGroupFromPath,
} from './AdoptionAnalyticsDashboardService';
import type { AdoptionAnalyticsDatabase } from './AdoptionAnalyticsDatabase';

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/** Shape returned by `AdoptionAnalyticsDatabase.getRawEvents`. */
type RawEvent = {
  userRef: string;
  action: string;
  subject: string;
  pluginId: string | null;
  pathname: string | null;
  sessionId: string | null;
  value: number | null;
  timestamp: Date;
};

function navigate(
  subject: string,
  days = 0,
  userRef = 'user:default/alice',
): RawEvent {
  return {
    userRef,
    action: 'navigate',
    subject,
    pluginId: null,
    pathname: null,
    sessionId: 'session-1',
    timestamp: daysAgo(days),
    value: null,
  };
}

function createService(events: RawEvent[]) {
  return new AdoptionAnalyticsDashboardService({
    logger: mockServices.logger.mock(),
    db: {
      getRawEvents: jest.fn().mockResolvedValue(events),
      getEntityCountSnapshots: jest.fn().mockResolvedValue([]),
    } as unknown as AdoptionAnalyticsDatabase,
    catalog: catalogServiceMock({ entities: [] }),
    auth: mockServices.auth(),
  });
}

describe('pageGroupFromPath', () => {
  it.each([
    ['/', '/'],
    ['/docs', '/docs'],
    ['/docs/', '/docs'],
    ['/docs/default/component/foo/getting-started', '/docs'],
    ['/catalog/default/component/foo', '/catalog'],
    ['//catalog//default', '/catalog'],
    ['/Docs/Default', '/docs'],
    ['  /docs  ', '/docs'],
  ])('collapses %p to %p', (input, expected) => {
    expect(pageGroupFromPath(input)).toBe(expected);
  });

  it('drops the query string and hash', () => {
    // Some plugins put free-text filters in the query string, which must
    // not end up rendered as a page name on the dashboard.
    expect(pageGroupFromPath('/search?query=secret+project')).toBe('/search');
    expect(pageGroupFromPath('/docs#section')).toBe('/docs');
  });

  it('returns null for values that are not paths', () => {
    expect(pageGroupFromPath('Home Page')).toBeNull();
    expect(pageGroupFromPath('')).toBeNull();
  });
});

describe('AdoptionAnalyticsDashboardService topPages', () => {
  it('groups navigation events by their first path segment', async () => {
    const service = createService([
      navigate('/docs/default/component/foo'),
      navigate('/docs/default/component/bar'),
      navigate('/catalog/default/component/foo'),
      navigate('/'),
    ]);

    const { topPages } = await service.getDashboard('30d');

    expect(topPages).toEqual([
      { path: '/docs', views: 2, trendPct: null },
      { path: '/', views: 1, trendPct: null },
      { path: '/catalog', views: 1, trendPct: null },
    ]);
  });

  it('ignores actions other than navigate', async () => {
    const service = createService([
      navigate('/docs'),
      { ...navigate('/docs'), action: 'click' },
      { ...navigate('/docs'), action: 'search' },
    ]);

    const { topPages } = await service.getDashboard('30d');

    expect(topPages).toEqual([{ path: '/docs', views: 1, trendPct: null }]);
  });

  it('falls back to pathname when subject is not a path', async () => {
    // Some plugins send an opaque label as the subject rather than the
    // target route, so the captured location is the only usable value.
    const service = createService([
      { ...navigate('Docs Landing'), pathname: '/docs/landing' },
    ]);

    const { topPages } = await service.getDashboard('30d');

    expect(topPages).toEqual([{ path: '/docs', views: 1, trendPct: null }]);
  });

  it('compares against the previous window for the trend', async () => {
    const service = createService([
      navigate('/docs'),
      navigate('/docs'),
      // 40 days ago falls in the previous 30-day window.
      navigate('/docs', 40),
    ]);

    const { topPages } = await service.getDashboard('30d');

    expect(topPages).toEqual([{ path: '/docs', views: 2, trendPct: 100 }]);
  });

  it('orders ties by path so results are stable between requests', async () => {
    const service = createService([
      navigate('/settings'),
      navigate('/catalog'),
      navigate('/docs'),
    ]);

    const { topPages } = await service.getDashboard('30d');

    expect(topPages.map(p => p.path)).toEqual([
      '/catalog',
      '/docs',
      '/settings',
    ]);
  });

  it('returns an empty list when nothing was visited', async () => {
    const service = createService([]);

    const { topPages } = await service.getDashboard('30d');

    expect(topPages).toEqual([]);
  });
});
