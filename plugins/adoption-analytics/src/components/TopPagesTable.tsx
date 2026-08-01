import { makeStyles } from '@material-ui/core/styles';
import type { TopPageStat } from '@codeverse-gp/plugin-adoption-analytics-common';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { ChartCard } from './ChartCard';
import {
  BODY_HEIGHT_PX,
  HEADER_HEIGHT_PX,
  PaginationFooter,
  ROW_HEIGHT_PX,
  usePagedList,
} from './pagination';
import { analyticsColors, monoFont, uiFont } from './tokens';

const COLUMNS = '32px 1fr auto auto';

const useStyles = makeStyles(theme => {
  const colors = analyticsColors(theme);
  return {
    body: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: BODY_HEIGHT_PX,
    },
    header: {
      display: 'grid',
      gridTemplateColumns: COLUMNS,
      gap: theme.spacing(2),
      padding: theme.spacing(1, 1.5),
      fontFamily: uiFont,
      fontSize: 11,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.muted,
      borderBottom: `1px solid ${colors.border}`,
      height: HEADER_HEIGHT_PX,
      boxSizing: 'border-box',
    },
    rows: {
      flex: '1 1 auto',
    },
    row: {
      display: 'grid',
      gridTemplateColumns: COLUMNS,
      gap: theme.spacing(2),
      alignItems: 'center',
      padding: theme.spacing(1.25, 1.5),
      borderBottom: `1px solid ${colors.border}`,
      fontFamily: monoFont,
      fontSize: 12,
      color: colors.text,
      height: ROW_HEIGHT_PX,
      boxSizing: 'border-box',
      transition: 'background 120ms ease',
      '&:hover': {
        background: colors.hover,
      },
      '&:last-child': {
        borderBottom: 'none',
      },
    },
    rank: {
      color: colors.muted,
      fontVariantNumeric: 'tabular-nums',
    },
    path: {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      minWidth: 0,
    },
    metric: {
      fontVariantNumeric: 'tabular-nums',
    },
    trend: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
      fontWeight: 500,
      fontVariantNumeric: 'tabular-nums',
      minWidth: 64,
    },
    trendPositive: { color: colors.positive },
    trendNegative: { color: colors.negative },
    trendNeutral: { color: colors.muted },
    empty: {
      fontFamily: monoFont,
      fontSize: 12,
      color: colors.muted,
      padding: theme.spacing(3, 0),
      textAlign: 'center',
      flex: '1 1 auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
  };
});

type Props = {
  pages: TopPageStat[];
};

// A bare slash reads like a missing value in a table of named routes.
// This is display-only: the payload and the row tooltip keep the real
// path so the label never hides what was actually measured.
const PATH_LABELS: Record<string, string> = {
  '/': 'Home',
};

export function TopPagesTable({ pages }: Props) {
  const classes = useStyles();
  const paged = usePagedList(pages);
  const subtitle =
    pages.length === 0
      ? 'no page views'
      : 'Most viewed pages across the portal';

  return (
    <ChartCard title="Top Visited Pages" subtitle={subtitle}>
      <div className={classes.body}>
        {pages.length === 0 ? (
          <div className={classes.empty}>
            No navigation events captured in this window.
          </div>
        ) : (
          <>
            <div className={classes.header}>
              <span>#</span>
              <span>Page</span>
              <span>Views</span>
              <span>Trend</span>
            </div>
            <div className={classes.rows}>
              {paged.visible.map((row, i) => {
                const trend = row.trendPct;
                const TrendIcon =
                  trend === null || trend >= 0 ? TrendingUp : TrendingDown;
                return (
                  <div key={row.path} className={classes.row}>
                    <span className={classes.rank}>{paged.start + i + 1}</span>
                    <span className={classes.path} title={row.path}>
                      {PATH_LABELS[row.path] ?? row.path}
                    </span>
                    <span className={classes.metric}>
                      {row.views.toLocaleString()}
                    </span>
                    <span
                      className={`${classes.trend} ${trendClassFor(
                        trend,
                        classes,
                      )}`}
                    >
                      {trend === null ? (
                        '—'
                      ) : (
                        <>
                          <TrendIcon size={12} strokeWidth={2.5} />
                          {`${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%`}
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <PaginationFooter paged={paged} />
          </>
        )}
      </div>
    </ChartCard>
  );
}

function trendClassFor(
  trend: number | null,
  classes: ReturnType<typeof useStyles>,
): string {
  if (trend === null) return classes.trendNeutral;
  return trend >= 0 ? classes.trendPositive : classes.trendNegative;
}
