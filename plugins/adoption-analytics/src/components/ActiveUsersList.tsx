import { makeStyles } from '@material-ui/core/styles';
import type { ActiveUserSummary } from '@codeverse-gp/plugin-adoption-analytics-common';
import { User } from 'lucide-react';
import { ChartCard } from './ChartCard';
import {
  BODY_HEIGHT_PX,
  HEADER_HEIGHT_PX,
  PaginationFooter,
  ROW_HEIGHT_PX,
  usePagedList,
} from './pagination';
import { analyticsColors, monoFont, uiFont } from './tokens';

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
      transition: 'background 120ms ease',
      fontFamily: monoFont,
      fontSize: 12,
      color: colors.text,
      height: ROW_HEIGHT_PX,
      boxSizing: 'border-box',
      '&:hover': {
        background: colors.hover,
      },
      '&:last-child': {
        borderBottom: 'none',
      },
    },
    user: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      minWidth: 0,
    },
    avatar: {
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: colors.neutralSurface,
      color: colors.primary,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    userRef: {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    events: {
      fontVariantNumeric: 'tabular-nums',
      color: colors.muted,
    },
    lastSeen: {
      fontVariantNumeric: 'tabular-nums',
      color: colors.text,
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
  users: ActiveUserSummary[];
};

export function ActiveUsersList({ users }: Props) {
  const classes = useStyles();
  const paged = usePagedList(users);
  const subtitle =
    users.length === 0
      ? 'no activity yet'
      : `${users.length} unique user${users.length === 1 ? '' : 's'}`;

  // The backend replaces `userRef` with a stable pseudonym for callers
  // without the `adoption-analytics.users.read` permission. Detect the shape and
  // surface a small hint so viewers understand what they're seeing.
  const anyMasked = users.some(u => u.userRef.startsWith('user:masked/'));

  return (
    <ChartCard
      title="Active Users"
      subtitle={anyMasked ? `${subtitle} · pseudonymized` : subtitle}
    >
      <div className={classes.body}>
        {users.length === 0 ? (
          <div className={classes.empty}>
            No user activity captured in this window.
          </div>
        ) : (
          <>
            <div className={classes.header}>
              <span>User</span>
              <span>Events</span>
              <span>Last seen</span>
            </div>
            <div className={classes.rows}>
              {paged.visible.map(u => (
                <div key={u.userRef} className={classes.row}>
                  <span className={classes.user}>
                    <span className={classes.avatar}>
                      <User size={12} strokeWidth={2.25} />
                    </span>
                    <span className={classes.userRef} title={u.userRef}>
                      {shortName(u.userRef)}
                    </span>
                  </span>
                  <span className={classes.events}>
                    {u.eventCount.toLocaleString()}
                  </span>
                  <span className={classes.lastSeen}>
                    {formatRelative(u.lastSeen)}
                  </span>
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

/**
 * Renders `user:default/alice` as `alice` — falls back to the full ref
 * for anything we can't cleanly split so no information is lost.
 */
function shortName(ref: string): string {
  const slash = ref.lastIndexOf('/');
  return slash === -1 ? ref : ref.slice(slash + 1);
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
