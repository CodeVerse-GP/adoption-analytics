import Tooltip from '@material-ui/core/Tooltip';
import { makeStyles } from '@material-ui/core/styles';
import type {
  AdoptionAnalyticsDashboard,
  AdoptionAnalyticsTimeRange,
  KpiWithDelta,
} from '@codeverse-gp/plugin-adoption-analytics-common';
import { Info, TrendingDown, TrendingUp } from 'lucide-react';
import { analyticsColors, monoFont, uiFont } from './tokens';

const useStyles = makeStyles(theme => {
  const colors = analyticsColors(theme);
  return {
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      gap: theme.spacing(3),
      [theme.breakpoints.down('sm')]: {
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      },
      [theme.breakpoints.down('xs')]: {
        gridTemplateColumns: '1fr',
      },
    },
    card: {
      background: colors.card,
      borderRadius: 10,
      border: `1px solid ${colors.border}`,
      padding: theme.spacing(2.5),
      fontFamily: uiFont,
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1),
      transition: 'transform 150ms ease, box-shadow 150ms ease',
      '&:hover': {
        transform: 'translateY(-1px)',
        boxShadow: colors.cardShadow,
      },
    },
    labelRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing(1),
    },
    label: {
      fontFamily: monoFont,
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.muted,
    },
    infoIcon: {
      color: colors.muted,
      cursor: 'help',
      display: 'inline-flex',
      alignItems: 'center',
    },
    valueRow: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: theme.spacing(1),
    },
    value: {
      fontFamily: monoFont,
      fontSize: 32,
      fontWeight: 500,
      color: colors.text,
      lineHeight: 1,
    },
    delta: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontFamily: monoFont,
      fontSize: 12,
      fontWeight: 500,
      padding: '4px 8px',
      borderRadius: 999,
      cursor: 'help',
    },
    deltaPositive: {
      background: colors.positiveSurface,
      color: colors.positive,
    },
    deltaNegative: {
      background: colors.negativeSurface,
      color: colors.negative,
    },
    deltaNeutral: {
      background: colors.neutralSurface,
      color: colors.muted,
    },
    hint: {
      fontFamily: monoFont,
      fontSize: 11,
      color: colors.muted,
    },
    suffix: {
      fontSize: 14,
      color: colors.muted,
      marginLeft: 6,
    },
  };
});

type CardWindow = {
  /** Short human label for the current window, shown under the value. */
  currentLabel: string;
  /** Short human label for the comparison window. */
  previousLabel: string;
  /** Longer explanation surfaced on hover. */
  tooltip: string;
};

type Kpi = {
  label: string;
  kpi: KpiWithDelta;
  window: CardWindow;
  format?: (value: number) => string;
  suffix?: string;
};

type Props = {
  kpis: AdoptionAnalyticsDashboard['kpis'];
  /** Selected range — drives only the Total Entities comparison window. */
  range: AdoptionAnalyticsTimeRange;
};

const RANGE_LABELS: Record<AdoptionAnalyticsTimeRange, string> = {
  '7d': '7 days ago',
  '30d': '30 days ago',
  '90d': '90 days ago',
};

export function KpiCards({ kpis, range }: Props) {
  const classes = useStyles();

  const today = isoDate(new Date());
  const entitiesPrevLabel = RANGE_LABELS[range];
  // Every card reads as "<current window> vs <previous window>", using
  // one shared vocabulary: today / yesterday / last N days / previous N
  // days / N days ago. Exact dates live in the tooltip so the subtitles
  // stay short and directly comparable across cards.
  const cards: Kpi[] = [
    {
      label: 'Total Entities',
      kpi: kpis.totalEntities,
      window: {
        currentLabel: 'today',
        previousLabel: entitiesPrevLabel,
        tooltip: `Latest catalog snapshot (${today}) vs. the snapshot from ${entitiesPrevLabel}. Follows the range selector so you can see catalog growth over 7 / 30 / 90 days.`,
      },
    },
    {
      label: 'Daily Active Users',
      kpi: kpis.dau,
      window: {
        currentLabel: 'today',
        previousLabel: 'yesterday',
        tooltip: `Unique users active today (${today}, UTC), compared to yesterday. Not affected by the range selector.`,
      },
    },
    {
      label: 'Weekly Active Users',
      kpi: kpis.wau,
      window: {
        currentLabel: 'last 7 days',
        previousLabel: 'previous 7 days',
        tooltip:
          'Unique users in the last 7 days, compared to the previous 7 days. Not affected by the range selector.',
      },
    },
    {
      label: 'Avg Session Length',
      kpi: kpis.avgSessionMinutes,
      format: v => `${v.toFixed(1)}`,
      suffix: 'min',
      window: {
        currentLabel: 'today',
        previousLabel: 'yesterday',
        tooltip: 'Average session length today vs. yesterday.',
      },
    },
  ];

  return (
    <div className={classes.grid}>
      {cards.map(({ label, kpi, window, format, suffix }) => {
        const displayValue = format
          ? format(kpi.value)
          : kpi.value.toLocaleString();
        const delta = kpi.deltaPct;
        const positive = delta !== null && delta >= 0;
        const deltaClass = deltaClassFor(delta, positive, classes);
        const Icon = positive ? TrendingUp : TrendingDown;
        const deltaTooltip =
          delta === null
            ? `No data yet for the previous period (${window.previousLabel}). ` +
              `The delta will appear once there's activity to compare against.`
            : `${window.currentLabel} vs ${window.previousLabel}`;
        return (
          <div key={label} className={classes.card}>
            <div className={classes.labelRow}>
              <span className={classes.label}>{label}</span>
              <Tooltip title={window.tooltip} arrow enterDelay={100}>
                <span className={classes.infoIcon} aria-label={window.tooltip}>
                  <Info size={12} strokeWidth={2.25} />
                </span>
              </Tooltip>
            </div>
            <div className={classes.valueRow}>
              <span className={classes.value}>
                {displayValue}
                {suffix ? (
                  <span className={classes.suffix}>{suffix}</span>
                ) : null}
              </span>
              <Tooltip title={deltaTooltip} arrow enterDelay={100}>
                <span className={`${classes.delta} ${deltaClass}`}>
                  {delta !== null ? <Icon size={12} strokeWidth={2.5} /> : null}
                  {delta === null
                    ? 'no prior data'
                    : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
                </span>
              </Tooltip>
            </div>
            <span className={classes.hint}>
              {window.currentLabel} vs {window.previousLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function deltaClassFor(
  delta: number | null,
  positive: boolean,
  classes: ReturnType<typeof useStyles>,
): string {
  if (delta === null) return classes.deltaNeutral;
  return positive ? classes.deltaPositive : classes.deltaNegative;
}
