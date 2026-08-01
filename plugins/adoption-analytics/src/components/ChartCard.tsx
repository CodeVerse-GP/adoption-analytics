import { makeStyles, useTheme } from '@material-ui/core/styles';
import type { ReactNode } from 'react';
import { chartPalette, analyticsColors, monoFont, uiFont } from './tokens';

const useStyles = makeStyles(theme => {
  const colors = analyticsColors(theme);
  return {
    card: {
      background: colors.card,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
      padding: theme.spacing(2.5),
      fontFamily: uiFont,
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1),
      transition: 'box-shadow 150ms ease',
      '&:hover': {
        boxShadow: colors.cardShadow,
      },
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing(1),
    },
    titleGroup: {
      display: 'flex',
      alignItems: 'baseline',
      gap: theme.spacing(1),
      minWidth: 0,
    },
    title: {
      fontSize: 14,
      fontWeight: 600,
      color: colors.text,
      margin: 0,
    },
    subtitle: {
      fontSize: 11,
      color: colors.muted,
      fontFamily: monoFont,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    action: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      flexShrink: 0,
    },
    body: {
      minHeight: 260,
    },
  };
});

type Props = {
  title: string;
  subtitle?: string;
  /**
   * Optional right-aligned controls in the header — e.g. a filter
   * dropdown. Kept as a ReactNode so callers can drop in whatever fits.
   */
  action?: ReactNode;
  children: ReactNode;
};

/**
 * Small card wrapper shared by every chart on the dashboard so the header
 * treatment and spacing stay consistent.
 */
export function ChartCard({ title, subtitle, action, children }: Props) {
  const classes = useStyles();
  return (
    <div className={classes.card}>
      <div className={classes.header}>
        <div className={classes.titleGroup}>
          <h3 className={classes.title}>{title}</h3>
          {subtitle ? (
            <span className={classes.subtitle}>{subtitle}</span>
          ) : null}
        </div>
        {action ? <div className={classes.action}>{action}</div> : null}
      </div>
      <div className={classes.body}>{children}</div>
    </div>
  );
}

/**
 * Recharts takes axis styling as plain props rather than CSS classes, so
 * the colors have to be resolved from the theme at render time instead of
 * living in a static object.
 */
export function useAxisStyle() {
  const theme = useTheme();
  const colors = analyticsColors(theme);
  return {
    tick: {
      fontFamily: monoFont,
      fontSize: 11,
      fill: colors.muted,
    },
    axisLine: { stroke: colors.border },
    tickLine: { stroke: colors.border },
    /** Hover wash drawn behind the active bar/category. */
    cursorFill: colors.hover,
  };
}

export { chartPalette };
