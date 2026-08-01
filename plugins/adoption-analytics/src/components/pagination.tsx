import { makeStyles } from '@material-ui/core/styles';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { analyticsColors, monoFont } from './tokens';

/**
 * Rows shown per page in list-style cards (Top Search Queries, Active
 * Users, ...). Kept in one place so every card gets a matching height.
 */
export const PAGE_SIZE = 7;
export const ROW_HEIGHT_PX = 42;
export const HEADER_HEIGHT_PX = 32;
export const BODY_HEIGHT_PX = HEADER_HEIGHT_PX + PAGE_SIZE * ROW_HEIGHT_PX;

type PagedList<T> = {
  visible: T[];
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  next: () => void;
  prev: () => void;
};

/**
 * Slices `items` into fixed-size pages and returns the current page plus
 * navigation callbacks. Resets to page 0 whenever `items` changes so the
 * user never lands on a stale empty page after a range switch.
 */
export function usePagedList<T>(
  items: T[],
  pageSize = PAGE_SIZE,
): PagedList<T> {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(0);
  }, [items]);

  const clampedPage = Math.min(page, pageCount - 1);
  const start = clampedPage * pageSize;
  const end = Math.min(start + pageSize, items.length);
  const visible = useMemo(() => items.slice(start, end), [items, start, end]);

  return {
    visible,
    page: clampedPage,
    pageCount,
    start,
    end,
    total: items.length,
    next: () => setPage(p => Math.min(pageCount - 1, p + 1)),
    prev: () => setPage(p => Math.max(0, p - 1)),
  };
}

const useStyles = makeStyles(theme => {
  const colors = analyticsColors(theme);
  return {
    root: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: theme.spacing(1),
      padding: theme.spacing(1, 1.5),
      borderTop: `1px solid ${colors.border}`,
      fontFamily: monoFont,
      fontSize: 11,
      color: colors.muted,
    },
    button: {
      background: 'transparent',
      border: `1px solid ${colors.border}`,
      borderRadius: 6,
      padding: 4,
      cursor: 'pointer',
      color: colors.text,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background 120ms ease, color 120ms ease',
      '&:hover:not(:disabled)': {
        background: colors.hover,
      },
      '&:disabled': {
        opacity: 0.35,
        cursor: 'not-allowed',
      },
    },
  };
});

type FooterProps<T> = {
  paged: PagedList<T>;
};

/**
 * Standard prev/next pagination footer used by list-style cards. Renders
 * nothing when there's a single page so simple result sets stay clean.
 */
export function PaginationFooter<T>({ paged }: FooterProps<T>) {
  const classes = useStyles();
  if (paged.pageCount <= 1) return null;
  return (
    <div className={classes.root}>
      <span>
        {paged.start + 1}–{paged.end} of {paged.total}
      </span>
      <button
        type="button"
        className={classes.button}
        aria-label="Previous page"
        disabled={paged.page === 0}
        onClick={paged.prev}
      >
        <ChevronLeft size={14} strokeWidth={2.25} />
      </button>
      <button
        type="button"
        className={classes.button}
        aria-label="Next page"
        disabled={paged.page >= paged.pageCount - 1}
        onClick={paged.next}
      >
        <ChevronRight size={14} strokeWidth={2.25} />
      </button>
    </div>
  );
}
