import type { AnalyticsApi, AnalyticsEvent } from '@backstage/core-plugin-api';

/**
 * Fan-out `AnalyticsApi` that forwards every captured event to a set of
 * inner analytics implementations. Useful for keeping an existing provider
 * (e.g. Google Analytics) while also feeding the adoption analytics backend.
 *
 * Each inner call is wrapped so a throw from one implementation never
 * prevents the others from receiving the event.
 */
export class CompositeAnalyticsApi implements AnalyticsApi {
  /**
   * @param apis - Implementations to forward every event to.
   * @param onError - Receives any error thrown by an inner implementation.
   *   Wire this to the app's `ErrorApi` with `{ hidden: true }`: an
   *   analytics failure should reach error tracking but is never
   *   actionable for the user, so it must not surface in the UI.
   */
  constructor(
    private readonly apis: readonly AnalyticsApi[],
    private readonly onError: (error: unknown) => void,
  ) {}

  captureEvent(event: AnalyticsEvent): void {
    for (const api of this.apis) {
      try {
        api.captureEvent(event);
      } catch (err) {
        this.onError(err);
      }
    }
  }
}
