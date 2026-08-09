import { makeStyles } from '@material-ui/core/styles';
import type { PluginAdoptionStat } from '@codeverse-gp/plugin-adoption-analytics-common';
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

// Fixed widths on the metric columns: `auto` sized them to their content,
// which let the numbers drift away from the headings above them.
const COLUMNS = '32px minmax(0, 1fr) 80px 80px 132px 88px';

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
      gap: theme.spacing(3),
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
    headEnd: {
      textAlign: 'right',
    },
    rows: {
      flex: '1 1 auto',
    },
    row: {
      display: 'grid',
      gridTemplateColumns: COLUMNS,
      gap: theme.spacing(3),
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
    plugin: {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      minWidth: 0,
    },
    metric: {
      fontVariantNumeric: 'tabular-nums',
      textAlign: 'right',
    },
    share: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: theme.spacing(1),
    },
    shareTrack: {
      flex: '1 1 auto',
      height: 4,
      borderRadius: 2,
      background: colors.neutralSurface,
      overflow: 'hidden',
    },
    shareFill: {
      display: 'block',
      height: '100%',
      background: colors.primary,
    },
    shareValue: {
      color: colors.muted,
      fontVariantNumeric: 'tabular-nums',
      minWidth: 32,
      textAlign: 'right',
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
      maxWidth: 420,
      margin: '0 auto',
    },
  };
});

type Props = {
  plugins: PluginAdoptionStat[];
};

export function PluginAdoptionTable({ plugins }: Props) {
  const classes = useStyles();
  const paged = usePagedList(plugins);
  const totalEvents = plugins.reduce((sum, p) => sum + p.events, 0);
  const subtitle =
    plugins.length === 0
      ? 'no plugin activity'
      : `${plugins.length} plugin${
          plugins.length === 1 ? '' : 's'
        } · ${totalEvents.toLocaleString()} events`;

  return (
    <ChartCard title="Plugin Adoption" subtitle={subtitle}>
      <div className={classes.body}>
        {plugins.length === 0 ? (
          <div className={classes.empty}>
            No plugin-attributed events in this window. Only events carrying an
            analytics plugin id are counted here.
          </div>
        ) : (
          <>
            <div className={classes.header}>
              <span>#</span>
              <span>Plugin</span>
              <span className={classes.headEnd}>Events</span>
              <span className={classes.headEnd}>Users</span>
              <span className={classes.headEnd}>Share</span>
              <span className={classes.headEnd}>Trend</span>
            </div>
            <div className={classes.rows}>
              {paged.visible.map((row, i) => {
                const trend = row.trendPct;
                const TrendIcon =
                  trend === null || trend >= 0 ? TrendingUp : TrendingDown;
                const share =
                  totalEvents === 0 ? 0 : (row.events / totalEvents) * 100;
                return (
                  <div key={row.pluginId} className={classes.row}>
                    <span className={classes.rank}>{paged.start + i + 1}</span>
                    <span className={classes.plugin} title={row.pluginId}>
                      {row.pluginId}
                    </span>
                    <span className={classes.metric}>
                      {row.events.toLocaleString()}
                    </span>
                    <span className={classes.metric}>
                      {row.users.toLocaleString()}
                    </span>
                    <span className={classes.share}>
                      <span className={classes.shareTrack}>
                        <span
                          className={classes.shareFill}
                          style={{ width: `${share}%` }}
                        />
                      </span>
                      <span className={classes.shareValue}>
                        {share.toFixed(0)}%
                      </span>
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
