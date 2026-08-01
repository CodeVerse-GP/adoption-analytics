import { Page, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { usePermission } from '@backstage/plugin-permission-react';
import { makeStyles } from '@material-ui/core/styles';
import type {
  AdoptionAnalyticsDashboard,
  AdoptionAnalyticsTimeRange,
} from '@codeverse-gp/plugin-adoption-analytics-common';
import { adoptionAnalyticsPageViewPermission } from '@codeverse-gp/plugin-adoption-analytics-common';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adoptionAnalyticsApiRef } from '../api';
import { ActiveUsersList } from './ActiveUsersList';
import { DauChart } from './DauChart';
import { EntityGrowthChart } from './EntityGrowthChart';
import { KpiCards } from './KpiCards';
import { SearchVolumeChart } from './SearchVolumeChart';
import { SectionTabs, type SectionTabDef } from './SectionTabs';
import { TopBar } from './TopBar';
import { TopEntitiesTable } from './TopEntitiesTable';
import { TopPagesTable } from './TopPagesTable';
import { TopSearchTerms } from './TopSearchTerms';
import { WauSessionsChart } from './WauSessionsChart';
import { analyticsColors, uiFont } from './tokens';
import { useAdoptionAnalyticsFonts } from './useAdoptionAnalyticsFonts';

type SectionId = 'catalog' | 'search' | 'users';
const DEFAULT_SECTION: SectionId = 'users';
const SECTION_IDS: readonly SectionId[] = ['users', 'catalog', 'search'];

function isSectionId(v: string | null): v is SectionId {
  return v !== null && (SECTION_IDS as readonly string[]).includes(v);
}

const useStyles = makeStyles(theme => {
  const colors = analyticsColors(theme);
  return {
    // Claim the `pageContent` grid slot of `<Page>` directly so the
    // dashboard fills the full width available next to the sidebar.
    wrapper: {
      gridArea: 'pageContent',
      display: 'flex',
      flexDirection: 'column',
      background: colors.background,
      fontFamily: uiFont,
      color: colors.text,
      minWidth: 0, // prevents chart SVGs from forcing horizontal overflow
    },
    body: {
      padding: theme.spacing(4),
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(3),
      flex: '1 1 auto',
    },
    chartGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: theme.spacing(3),
      [theme.breakpoints.down('sm')]: {
        gridTemplateColumns: '1fr',
      },
    },
    error: {
      background: colors.card,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
      padding: theme.spacing(3),
      color: colors.negative,
    },
    denied: {
      background: colors.card,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
      padding: theme.spacing(3),
      color: colors.text,
    },
    deniedHint: {
      marginTop: theme.spacing(1),
      fontSize: 13,
      color: colors.muted,
    },
  };
});

export function AdoptionAnalyticsPage() {
  const classes = useStyles();
  useAdoptionAnalyticsFonts();
  const api = useApi(adoptionAnalyticsApiRef);
  const [range, setRange] = useState<AdoptionAnalyticsTimeRange>('30d');
  const [data, setData] = useState<AdoptionAnalyticsDashboard | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  // Tab state is mirrored in the URL (?tab=users) so users can bookmark
  // or link a specific section. Falling back to the default keeps
  // untyped / stale query values safe.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: SectionId = isSectionId(tabParam)
    ? tabParam
    : DEFAULT_SECTION;
  const setActiveTab = (id: SectionId): void => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  const { allowed: canView, loading: permissionLoading } = usePermission({
    permission: adoptionAnalyticsPageViewPermission,
  });

  useEffect(() => {
    // Skip the request entirely when the caller can't view the page —
    // the backend would reject it with 403 anyway, and surfacing that
    // as a generic load failure would be misleading.
    if (permissionLoading || !canView) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getDashboard(range)
      .then(res => {
        if (cancelled) return;
        setData(res);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err as Error);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, range, canView, permissionLoading]);

  return (
    <Page themeId="tool">
      <div className={classes.wrapper}>
        <TopBar
          range={range}
          onRangeChange={setRange}
          generatedAt={data?.generatedAt ?? null}
        />
        <div className={classes.body}>
          {renderBody({
            error,
            loading,
            data,
            classes,
            activeTab,
            setActiveTab,
            canView,
            permissionLoading,
          })}
        </div>
      </div>
    </Page>
  );
}

function renderBody({
  error,
  loading,
  data,
  classes,
  activeTab,
  setActiveTab,
  canView,
  permissionLoading,
}: {
  error: Error | null;
  loading: boolean;
  data: AdoptionAnalyticsDashboard | null;
  classes: ReturnType<typeof useStyles>;
  activeTab: SectionId;
  setActiveTab: (id: SectionId) => void;
  canView: boolean;
  permissionLoading: boolean;
}) {
  if (permissionLoading) {
    return <Progress />;
  }
  if (!canView) {
    return (
      <div className={classes.denied}>
        You don't have access to Backstage Adoption Analytics.
        <div className={classes.deniedHint}>
          Viewing this dashboard requires the{' '}
          <code>adoption-analytics.page.view</code> permission. Ask a Backstage
          administrator to add one of your groups to{' '}
          <code>adoptionAnalytics.viewerGroups</code>.
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className={classes.error}>
        Failed to load dashboard: {error.message}
      </div>
    );
  }
  if (loading || !data) {
    return <Progress />;
  }

  // Tab counts serve as at-a-glance badges next to the tab labels so
  // users can tell which section has activity before switching.
  const tabs: ReadonlyArray<SectionTabDef<SectionId>> = [
    { id: 'users', label: 'Users', count: data.activeUsers.length },
    { id: 'catalog', label: 'Catalog', count: data.topEntities.length },
    { id: 'search', label: 'Search', count: data.search.total },
  ];

  return (
    <>
      <KpiCards kpis={data.kpis} range={data.range} />
      <SectionTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {activeTab === 'users' ? (
        <UsersSection data={data} classes={classes} />
      ) : null}
      {activeTab === 'catalog' ? (
        <CatalogSection data={data} classes={classes} />
      ) : null}
      {activeTab === 'search' ? (
        <SearchSection data={data} classes={classes} />
      ) : null}
    </>
  );
}

type SectionProps = {
  data: AdoptionAnalyticsDashboard;
  classes: ReturnType<typeof useStyles>;
};

function UsersSection({ data, classes }: SectionProps) {
  return (
    <>
      <div className={classes.chartGrid}>
        <DauChart data={data.dau} />
        <WauSessionsChart data={data.wauSessions} />
      </div>
      <ActiveUsersList users={data.activeUsers} />
    </>
  );
}

function CatalogSection({ data }: SectionProps) {
  return (
    <>
      <EntityGrowthChart data={data.entityGrowth} />
      <TopEntitiesTable entities={data.topEntities} />
      <TopPagesTable pages={data.topPages} />
    </>
  );
}

function SearchSection({ data, classes }: SectionProps) {
  return (
    <div className={classes.chartGrid}>
      <SearchVolumeChart data={data.search.volume} total={data.search.total} />
      <TopSearchTerms terms={data.search.topTerms} />
    </div>
  );
}
