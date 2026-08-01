import { makeStyles, useTheme } from '@material-ui/core/styles';
import type { TopEntityStat } from '@codeverse-gp/plugin-adoption-analytics-common';
import {
  Box,
  Component,
  Database,
  Layers,
  type LucideIcon,
  Package,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { ChartCard } from './ChartCard';
import { chartPalette, analyticsColors, monoFont, uiFont } from './tokens';

type KindMeta = {
  icon: LucideIcon;
  color: string;
};

type BadgeProps = {
  color: string;
};

const KIND_META: Record<string, KindMeta> = {
  Component: { icon: Component, color: chartPalette.blue },
  API: { icon: Layers, color: chartPalette.teal },
  System: { icon: Package, color: chartPalette.violet },
  Resource: { icon: Database, color: chartPalette.amber },
  Group: { icon: Users, color: chartPalette.red },
};

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
  entities: TopEntityStat[];
};

// The badge is tinted with the kind's series colour, which is only known
// at render time. On dark surfaces a 10% wash of that colour disappears,
// so the alpha is lifted rather than fixed. JSS resolves function values
// per `useStyles` call, so this sits in its own component to keep the
// hook out of the row loop.
const useBadgeStyles = makeStyles(theme => ({
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontFamily: uiFont,
    fontWeight: 500,
    background: ({ color }: BadgeProps) =>
      `${color}${theme.palette.type === 'dark' ? '33' : '1A'}`,
    color: ({ color }: BadgeProps) => color,
  },
}));

function KindBadge({ kind, meta }: { kind: string; meta: KindMeta }) {
  const classes = useBadgeStyles({ color: meta.color });
  const Icon = meta.icon;
  return (
    <span className={classes.badge}>
      <Icon size={12} strokeWidth={2.25} />
      {kind}
    </span>
  );
}

export function TopEntitiesTable({ entities }: Props) {
  const classes = useStyles();
  const colors = analyticsColors(useTheme());
  const fallbackKindMeta: KindMeta = { icon: Box, color: colors.muted };
  if (entities.length === 0) {
    return (
      <ChartCard title="Top Entities" subtitle="by views">
        <div className={classes.empty}>No navigation events recorded yet.</div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Top Entities" subtitle="by views">
      <table className={classes.table}>
        <thead>
          <tr>
            <th className={classes.head}>Entity</th>
            <th className={classes.head}>Kind</th>
            <th className={classes.head}>Owner</th>
            <th className={`${classes.head} ${classes.numeric}`}>Views</th>
            <th className={`${classes.head} ${classes.numeric}`}>Trend</th>
          </tr>
        </thead>
        <tbody>
          {entities.map((row, i) => {
            const meta = KIND_META[row.kind] ?? fallbackKindMeta;
            const trend = row.trendPct;
            const trendClass = trendClassFor(trend, classes);
            const TrendIcon =
              trend === null || trend >= 0 ? TrendingUp : TrendingDown;
            const rowClass =
              i % 2 === 1 ? `${classes.row} ${classes.rowStripe}` : classes.row;
            return (
              <tr key={row.entityRef} className={rowClass}>
                <td className={classes.cell}>{row.name}</td>
                <td className={classes.cell}>
                  <KindBadge kind={row.kind} meta={meta} />
                </td>
                <td className={classes.cell}>{row.owner ?? '—'}</td>
                <td className={`${classes.cell} ${classes.numeric}`}>
                  {row.views.toLocaleString()}
                </td>
                <td className={`${classes.cell} ${classes.numeric}`}>
                  <span className={`${classes.trend} ${trendClass}`}>
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
