import type { AnalyticsApi, AnalyticsEvent } from '@backstage/core-plugin-api';
import type { AdoptionAnalyticsEvent } from '@codeverse-gp/plugin-adoption-analytics-common';
import {
  ADOPTION_ANALYTICS_EVENT_ACTIONS,
  ADOPTION_ANALYTICS_SESSION_STORAGE_KEY,
} from '@codeverse-gp/plugin-adoption-analytics-common';
import type { AdoptionAnalyticsApi } from './index';

const DEFAULT_FLUSH_MS = 5_000;
const DEFAULT_MAX_BATCH = 20;
const DEFAULT_SEARCH_DEBOUNCE_MS = 800;
const MIN_SEARCH_LENGTH = 2;
/** A gap this long without activity starts a new session. */
const DEFAULT_SESSION_IDLE_MS = 30 * 60 * 1000;

type Options = {
  adoptionAnalyticsApi: AdoptionAnalyticsApi;
  /** How long to wait before flushing a pending batch. Defaults to 5s. */
  flushIntervalMs?: number;
  /** Maximum events to hold before flushing early. Defaults to 20. */
  maxBatchSize?: number;
  /**
   * Debounce for `search` events so live-typing collapses into the final
   * query. Defaults to 800ms.
   */
  searchDebounceMs?: number;
  /**
   * Idle gap after which a new session id is minted. Defaults to 30
   * minutes (the GA-standard session timeout).
   */
  sessionIdleMs?: number;
  /**
   * Called when a flush fails. Wire this to the app's `ErrorApi` with
   * `{ hidden: true }`: a dropped analytics batch should reach error
   * tracking but is never actionable for the user, so it must not
   * surface in the UI.
   */
  onError: (error: unknown) => void;
};

/**
 * Implements Backstage's `AnalyticsApi` by forwarding captured events to the
 * adoption analytics backend. Events are batched to avoid one request per navigation.
 *
 * This class intentionally never throws upstream: failures are surfaced
 * through `onError` so a broken adoption analytics backend never breaks the user's UI.
 */
export class AdoptionAnalyticsCaptureApi implements AnalyticsApi {
  private readonly queue: AdoptionAnalyticsEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly searchDebounceMs: number;
  private readonly sessionIdleMs: number;
  private readonly onError: (error: unknown) => void;

  // Buffers the most recent `search` event so we can emit only the final
  // query text after the user stops typing. Backstage's SearchBar fires
  // an event on every keystroke, which would otherwise flood the DB with
  // partial prefixes ("p", "pa", "pay", "paym", ...).
  private pendingSearch: {
    event: AdoptionAnalyticsEvent;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(private readonly options: Options) {
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_MS;
    this.maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH;
    this.searchDebounceMs =
      options.searchDebounceMs ?? DEFAULT_SEARCH_DEBOUNCE_MS;
    this.sessionIdleMs = options.sessionIdleMs ?? DEFAULT_SESSION_IDLE_MS;
    this.onError = options.onError;

    // Flush eagerly when the tab is hidden or navigated away so pending
    // events aren't lost — the underlying fetch uses `keepalive: true`
    // and the browser will let it complete during unload.
    if (typeof document !== 'undefined') {
      document.addEventListener(
        'visibilitychange',
        this.handleVisibilityChange,
      );
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.handlePageHide);
    }
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      void this.flush();
    }
  };

  private readonly handlePageHide = (): void => {
    void this.flush();
  };

  captureEvent(event: AnalyticsEvent): void {
    // For `navigate` events Backstage's RouteTracker puts the target URL
    // path in `subject` — capturing `window.location.pathname` for all
    // other events keeps the field meaningful for click / search too.
    const pathname =
      typeof window !== 'undefined' ? window.location.pathname : undefined;

    const adoptionAnalyticsEvent: AdoptionAnalyticsEvent = {
      action: event.action,
      subject: event.subject,
      value: event.value,
      pluginId: event.context?.pluginId,
      pathname,
      sessionId: this.currentSessionId(),
      timestamp: new Date().toISOString(),
    };

    if (event.action === ADOPTION_ANALYTICS_EVENT_ACTIONS.search) {
      this.stagePendingSearch(adoptionAnalyticsEvent);
      return;
    }

    this.enqueue(adoptionAnalyticsEvent);
  }

  /**
   * Force any pending events to be sent. Safe to call at any time. Any
   * search buffered by the debounce is committed to the queue first so
   * unload / visibility-change flushes never lose it.
   * @public
   */
  async flush(): Promise<void> {
    this.commitPendingSearch();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      await this.options.adoptionAnalyticsApi.postEvents(batch);
    } catch (err) {
      this.onError(err);
    }
  }

  private enqueue(event: AdoptionAnalyticsEvent): void {
    this.queue.push(event);
    if (this.queue.length >= this.maxBatchSize) {
      void this.flush();
      return;
    }
    this.scheduleFlush();
  }

  /**
   * Debounces search events. Each new keystroke replaces the pending
   * event and resets the timer; short/empty queries are dropped entirely
   * so the DB doesn't collect noise like `"p"` or `"pa"`.
   */
  private stagePendingSearch(event: AdoptionAnalyticsEvent): void {
    if (this.pendingSearch) {
      clearTimeout(this.pendingSearch.timer);
      this.pendingSearch = null;
    }
    if (event.subject.trim().length < MIN_SEARCH_LENGTH) return;

    const timer = setTimeout(() => {
      this.commitPendingSearch();
    }, this.searchDebounceMs);
    this.pendingSearch = { event, timer };
  }

  private commitPendingSearch(): void {
    const pending = this.pendingSearch;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingSearch = null;
    this.enqueue(pending.event);
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }

  /**
   * Returns the session id to stamp on the current event, minting a new
   * one when the previous session has expired. A session ends when
   * either:
   *   - more than `sessionIdleMs` has elapsed since the last event, or
   *   - the UTC calendar day has changed (keeps sessions from spanning
   *     midnight, which would blur the daily buckets).
   *
   * The `{ id, lastSeen, day }` record is persisted in `sessionStorage`
   * so a page reload within an active session keeps the same id, while a
   * long-idle tab correctly starts a fresh session.
   */
  private currentSessionId(): string {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);

    const prev = readSessionRecord();
    if (
      prev &&
      prev.day === today &&
      now - prev.lastSeen <= this.sessionIdleMs
    ) {
      writeSessionRecord({ id: prev.id, lastSeen: now, day: today });
      return prev.id;
    }

    const id = generateSessionId();
    writeSessionRecord({ id, lastSeen: now, day: today });
    return id;
  }
}

type SessionRecord = {
  id: string;
  /** Epoch millis of the most recent event in this session. */
  lastSeen: number;
  /** UTC date (YYYY-MM-DD) the session belongs to. */
  day: string;
};

function readSessionRecord(): SessionRecord | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(
      ADOPTION_ANALYTICS_SESSION_STORAGE_KEY,
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionRecord>;
    if (
      typeof parsed.id === 'string' &&
      typeof parsed.lastSeen === 'number' &&
      typeof parsed.day === 'string'
    ) {
      return parsed as SessionRecord;
    }
    return null;
  } catch {
    // Corrupt JSON, or sessionStorage unavailable (Safari private mode).
    return null;
  }
}

function writeSessionRecord(record: SessionRecord): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    window.sessionStorage.setItem(
      ADOPTION_ANALYTICS_SESSION_STORAGE_KEY,
      JSON.stringify(record),
    );
  } catch {
    // Best-effort — a failed write just means the next event mints a new
    // id, which is acceptable degradation.
  }
}

function generateSessionId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
