import { makeStyles } from '@material-ui/core/styles';
import type { TechDocsSiteStat } from '@codeverse-gp/plugin-adoption-analytics-common';
import { BookOpen, TrendingDown, TrendingUp } from 'lucide-react';
import { ChartCard } from './ChartCard';
import { analyticsColors, monoFont, uiFont } from './tokens';

const useStyles = makeStyles(theme => {
  const colors = analyticsColors(theme);
  return {
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: monoFont,
      fontSize: 12,
    },
    head: {
      fontFamily: uiFont,
      fontSize: 11,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.muted,
      textAlign: 'left',
      padding: theme.spacing(1, 1.5),
      borderBottom: `1px solid ${colors.border}`,
    },
    cell: {
      padding: theme.spacing(1.25, 1.5),
      borderBottom: `1px solid ${colors.border}`,
      color: colors.text,
    },
    rowStripe: {
      background: colors.tableStripe,
    },
    row: {
      transition: 'background 120ms ease',
      '&:hover td': {
        background: colors.hover,
      },
    },
    site: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    siteName: {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    icon: {
      color: colors.muted,
      display: 'inline-flex',
      flexShrink: 0,
    },
    numeric: {
      textAlign: 'right',
      fontVariantNumeric: 'tabular-nums',
    },
    trend: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontWeight: 500,
    },
    trendPositive: { color: colors.positive },
    trendNegative: { color: colors.negative },
    trendNeutral: { color: colors.muted },
    empty: {
      fontSize: 12,
      color: colors.muted,
      padding: theme.spacing(3, 0),
      textAlign: 'center',
    },
  };
});

type Props = {
  docs: TechDocsSiteStat[];
};

export function TopDocsTable({ docs }: Props) {
  const classes = useStyles();

  if (docs.length === 0) {
    return (
      <ChartCard title="Top TechDocs Sites" subtitle="by views">
        <div className={classes.empty}>
          No documentation pages were opened in this window.
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Top TechDocs Sites" subtitle="by views">
      <table className={classes.table}>
        <thead>
          <tr>
            <th className={classes.head}>Site</th>
            <th className={classes.head}>Owner</th>
            <th className={`${classes.head} ${classes.numeric}`}>Views</th>
            <th className={`${classes.head} ${classes.numeric}`}>Readers</th>
            <th className={`${classes.head} ${classes.numeric}`}>Pages</th>
            <th className={`${classes.head} ${classes.numeric}`}>Trend</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((row, i) => {
            const trend = row.trendPct;
            const TrendIcon =
              trend === null || trend >= 0 ? TrendingUp : TrendingDown;
            const rowClass =
              i % 2 === 1 ? `${classes.row} ${classes.rowStripe}` : classes.row;
            return (
              <tr key={row.entityRef} className={rowClass}>
                <td className={classes.cell}>
                  <span className={classes.site} title={row.entityRef}>
                    <span className={classes.icon}>
                      <BookOpen size={12} strokeWidth={2.25} />
                    </span>
                    <span className={classes.siteName}>{row.name}</span>
                  </span>
                </td>
                <td className={classes.cell}>{row.owner ?? '—'}</td>
                <td className={`${classes.cell} ${classes.numeric}`}>
                  {row.views.toLocaleString()}
                </td>
                <td className={`${classes.cell} ${classes.numeric}`}>
                  {row.readers.toLocaleString()}
                </td>
                <td className={`${classes.cell} ${classes.numeric}`}>
                  {row.pages.toLocaleString()}
                </td>
                <td className={`${classes.cell} ${classes.numeric}`}>
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
