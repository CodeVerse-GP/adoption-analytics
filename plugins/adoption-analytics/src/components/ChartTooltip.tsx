import { makeStyles, useTheme } from '@material-ui/core/styles';
import type { TooltipProps } from 'recharts';
import { analyticsColors, monoFont } from './tokens';

const useStyles = makeStyles(theme => {
  const colors = analyticsColors(theme);
  return {
    root: {
      background: colors.card,
      border: `1px solid ${colors.border}`,
      boxShadow: colors.popoverShadow,
      borderRadius: 6,
      padding: '10px 12px',
      fontFamily: monoFont,
      fontSize: 12,
      color: colors.text,
      minWidth: 140,
    },
    label: {
      color: colors.muted,
      marginBottom: 6,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    row: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 2,
    },
    name: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    },
    value: {
      fontWeight: 500,
    },
  };
});

// The swatch is tinted with the series colour, which is only known at
// render time. JSS resolves function values per `useStyles` call, so this
// sits in its own component to keep the hook out of the payload loop.
const useSwatchStyles = makeStyles({
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
    background: ({ color }: { color: string }) => color,
  },
});

function Swatch({ color }: { color: string }) {
  const classes = useSwatchStyles({ color });
  return <span className={classes.swatch} />;
}

/**
 * Recharts-compatible tooltip that follows the dashboard's monospace /
 * card treatment. Kept lightweight so it can be dropped into any chart.
 */
export function ChartTooltip(props: TooltipProps<number, string>) {
  const { active, payload, label } = props;
  const classes = useStyles();
  const colors = analyticsColors(useTheme());
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className={classes.root}>
      {label !== undefined && (
        <div className={classes.label}>{String(label)}</div>
      )}
      {payload.map(p => (
        <div key={String(p.dataKey)} className={classes.row}>
          <span className={classes.name}>
            <Swatch color={String(p.color ?? colors.primary)} />
            {String(p.name ?? p.dataKey)}
          </span>
          <span className={classes.value}>
            {typeof p.value === 'number'
              ? p.value.toLocaleString()
              : String(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
