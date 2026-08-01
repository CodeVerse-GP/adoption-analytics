import { makeStyles } from '@material-ui/core/styles';
import type { AdoptionAnalyticsTimeRange } from '@codeverse-gp/plugin-adoption-analytics-common';
import { analyticsColors, monoFont, uiFont } from './tokens';

const useStyles = makeStyles(theme => {
  const colors = analyticsColors(theme);
  return {
    root: {
      position: 'sticky',
      top: 0,
      zIndex: 5,
      background: colors.card,
      borderBottom: `1px solid ${colors.border}`,
      padding: theme.spacing(3, 4),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing(2),
      fontFamily: uiFont,
    },
    titleBlock: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    title: {
      fontSize: 22,
      fontWeight: 600,
      color: colors.text,
      margin: 0,
      lineHeight: 1.2,
    },
    subtitle: {
      fontSize: 13,
      color: colors.muted,
      fontFamily: monoFont,
    },
    rangeGroup: {
      display: 'inline-flex',
      borderRadius: 8,
      background: colors.background,
      padding: 4,
      gap: 2,
    },
    rangeButton: {
      border: 'none',
      background: 'transparent',
      padding: '6px 12px',
      fontFamily: monoFont,
      fontSize: 12,
      color: colors.muted,
      borderRadius: 6,
      cursor: 'pointer',
      transition: 'background 120ms ease, color 120ms ease',
      '&:hover': {
        color: colors.text,
      },
    },
    rangeButtonActive: {
      background: colors.card,
      color: colors.primary,
      boxShadow: colors.popoverShadow,
      fontWeight: 600,
    },
  };
});

const OPTIONS: Array<{ value: AdoptionAnalyticsTimeRange; label: string }> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

type Props = {
  range: AdoptionAnalyticsTimeRange;
  onRangeChange: (range: AdoptionAnalyticsTimeRange) => void;
  generatedAt: string | null;
};

export function TopBar({ range, onRangeChange, generatedAt }: Props) {
  const classes = useStyles();
  return (
    <div className={classes.root}>
      <div className={classes.titleBlock}>
        <h1 className={classes.title}>Adoption Analytics</h1>
        <span className={classes.subtitle}>
          Backstage analytics — {formatUpdated(generatedAt)}
        </span>
      </div>
      <div
        className={classes.rangeGroup}
        role="tablist"
        aria-label="Time range"
      >
        {OPTIONS.map(opt => {
          const active = opt.value === range;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              className={
                active
                  ? `${classes.rangeButton} ${classes.rangeButtonActive}`
                  : classes.rangeButton
              }
              onClick={() => onRangeChange(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatUpdated(iso: string | null): string {
  if (!iso) return 'loading…';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return 'updated just now';
  if (minutes === 1) return 'updated 1 minute ago';
  if (minutes < 60) return `updated ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return `updated ${hours} hour${hours === 1 ? '' : 's'} ago`;
}
