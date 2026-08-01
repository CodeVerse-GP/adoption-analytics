import { makeStyles } from '@material-ui/core/styles';
import { analyticsColors, uiFont } from './tokens';

const useStyles = makeStyles(theme => {
  const colors = analyticsColors(theme);
  return {
    root: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: theme.spacing(0.5),
      borderBottom: `1px solid ${colors.border}`,
      fontFamily: uiFont,
    },
    tab: {
      border: 'none',
      background: 'transparent',
      padding: theme.spacing(1.25, 2),
      fontFamily: uiFont,
      fontSize: 13,
      fontWeight: 500,
      color: colors.muted,
      cursor: 'pointer',
      borderBottom: '2px solid transparent',
      marginBottom: -1,
      transition: 'color 120ms ease, border-color 120ms ease',
      '&:hover': {
        color: colors.text,
      },
    },
    tabActive: {
      color: colors.primary,
      borderBottomColor: colors.primary,
    },
    count: {
      marginLeft: theme.spacing(0.75),
      fontSize: 11,
      color: colors.muted,
      fontVariantNumeric: 'tabular-nums',
    },
  };
});

export type SectionTabDef<TId extends string> = {
  id: TId;
  label: string;
  /** Optional badge shown after the label, e.g. row count. */
  count?: number;
};

type Props<TId extends string> = {
  tabs: ReadonlyArray<SectionTabDef<TId>>;
  active: TId;
  onChange: (id: TId) => void;
};

/**
 * Underline-style tab bar used to split the Adoption Analytics dashboard into
 * themed sections (Users / Catalog / Search). Visually distinct from
 * the pill-style range selector in `TopBar` so the two controls don't
 * get confused for the same thing.
 */
export function SectionTabs<TId extends string>({
  tabs,
  active,
  onChange,
}: Props<TId>) {
  const classes = useStyles();
  return (
    <div className={classes.root} role="tablist">
      {tabs.map(tab => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={
              isActive ? `${classes.tab} ${classes.tabActive}` : classes.tab
            }
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {typeof tab.count === 'number' ? (
              <span className={classes.count}>
                {tab.count.toLocaleString()}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
