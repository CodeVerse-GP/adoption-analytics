import { makeStyles } from '@material-ui/core/styles';
import type { SearchTermStat } from '@codeverse-gp/plugin-adoption-analytics-common';
import { Search } from 'lucide-react';
import { ChartCard } from './ChartCard';
import {
  BODY_HEIGHT_PX,
  HEADER_HEIGHT_PX,
  PaginationFooter,
  ROW_HEIGHT_PX,
  usePagedList,
} from './pagination';
import { chartPalette, analyticsColors, monoFont, uiFont } from './tokens';

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
      gridTemplateColumns: '1fr auto auto',
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
      gridTemplateColumns: '1fr auto auto',
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
    query: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      minWidth: 0,
    },
    icon: {
      width: 24,
      height: 24,
      borderRadius: '50%',
      background:
        theme.palette.type === 'dark'
          ? 'rgba(139, 92, 246, 0.24)'
          : 'rgba(139, 92, 246, 0.12)',
      color: chartPalette.violet,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    queryText: {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    metric: {
      fontVariantNumeric: 'tabular-nums',
    },
    usersMetric: {
      fontVariantNumeric: 'tabular-nums',
      color: colors.muted,
    },
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
  terms: SearchTermStat[];
};

export function TopSearchTerms({ terms }: Props) {
  const classes = useStyles();
  const paged = usePagedList(terms);
  const subtitle = terms.length === 0 ? 'no searches' : `top ${terms.length}`;

  return (
    <ChartCard title="Top Search Queries" subtitle={subtitle}>
      <div className={classes.body}>
        {terms.length === 0 ? (
          <div className={classes.empty}>
            No search events captured in this window.
          </div>
        ) : (
          <>
            <div className={classes.header}>
              <span>Query</span>
              <span>Searches</span>
              <span>Users</span>
            </div>
            <div className={classes.rows}>
              {paged.visible.map(t => (
                <div key={t.query} className={classes.row}>
                  <span className={classes.query}>
                    <span className={classes.icon}>
                      <Search size={12} strokeWidth={2.25} />
                    </span>
                    <span className={classes.queryText} title={t.query}>
                      {t.query}
                    </span>
                  </span>
                  <span className={classes.metric}>
                    {t.count.toLocaleString()}
                  </span>
                  <span className={classes.usersMetric}>{t.users}</span>
                </div>
              ))}
            </div>
            <PaginationFooter paged={paged} />
          </>
        )}
      </div>
    </ChartCard>
  );
}
