/**
 * Design tokens for the Adoption Analytics dashboard. Kept in one place so the
 * charts, cards, and table all agree on colors and typography.
 *
 * Colors are derived from the active Backstage/MUI theme rather than
 * hardcoded, so the dashboard follows the user's light/dark preference
 * instead of always rendering on a white surface.
 */
import type { Theme } from '@material-ui/core/styles';

export type AnalyticsColors = {
  background: string;
  card: string;
  primary: string;
  accent: string;
  muted: string;
  border: string;
  text: string;
  tableStripe: string;
  positive: string;
  negative: string;
  /** Row / control hover wash. */
  hover: string;
  /** Tinted background for "positive" pills. */
  positiveSurface: string;
  /** Tinted background for "negative" pills. */
  negativeSurface: string;
  /** Tinted background for neutral pills and count badges. */
  neutralSurface: string;
  /** Elevation used by cards on hover. */
  cardShadow: string;
  /** Elevation used by floating surfaces (tooltips, active pills). */
  popoverShadow: string;
};

/**
 * Maps the surrounding MUI theme onto the dashboard's semantic color
 * slots. Call this inside `makeStyles(theme => ...)` or from `useTheme()`
 * so both light and dark Backstage themes are honoured.
 */
export function analyticsColors(theme: Theme): AnalyticsColors {
  const dark = theme.palette.type === 'dark';
  return {
    background: theme.palette.background.default,
    card: theme.palette.background.paper,
    primary: theme.palette.primary.main,
    accent: theme.palette.secondary.main,
    muted: theme.palette.text.secondary,
    border: theme.palette.divider,
    text: theme.palette.text.primary,
    // MUI has no "subtle striping" slot, so derive one that reads on both
    // themes: a faint lift on dark, a faint recess on light.
    tableStripe: dark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC',
    positive: theme.palette.success.main,
    negative: theme.palette.error.main,
    hover: theme.palette.action.hover,
    positiveSurface: dark
      ? 'rgba(13, 148, 136, 0.22)'
      : 'rgba(13, 148, 136, 0.1)',
    negativeSurface: dark
      ? 'rgba(239, 68, 68, 0.22)'
      : 'rgba(239, 68, 68, 0.1)',
    neutralSurface: theme.palette.action.selected,
    cardShadow: dark
      ? '0 6px 18px rgba(0, 0, 0, 0.45)'
      : '0 6px 18px rgba(15, 23, 41, 0.08)',
    popoverShadow: dark
      ? '0 4px 12px rgba(0, 0, 0, 0.5)'
      : '0 4px 12px rgba(15, 23, 41, 0.08)',
  };
}

/**
 * Series colors for charts. These stay fixed across themes so a given
 * entity kind keeps the same color when the user toggles light/dark,
 * but the shades are chosen to hold enough contrast on both surfaces.
 */
export const chartPalette = {
  blue: '#3B82F6',
  teal: '#14B8A6',
  violet: '#8B5CF6',
  amber: '#F59E0B',
  red: '#EF4444',
} as const;

export const monoFont = "'DM Mono', 'Roboto Mono', ui-monospace, monospace";
export const uiFont =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
