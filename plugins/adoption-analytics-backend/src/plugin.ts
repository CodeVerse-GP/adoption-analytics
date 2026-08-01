import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { createRouter } from './router';
import { EntitySnapshotCollector } from './service/EntitySnapshotCollector';
import { EventsQueue } from './service/EventsQueue';
import { AdoptionAnalyticsDashboardService } from './service/AdoptionAnalyticsDashboardService';
import { AdoptionAnalyticsDatabase } from './service/AdoptionAnalyticsDatabase';

export const adoptionAnalyticsPlugin = createBackendPlugin({
  pluginId: 'adoption-analytics',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        database: coreServices.database,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
        auth: coreServices.auth,
        scheduler: coreServices.scheduler,
        cache: coreServices.cache,
        config: coreServices.rootConfig,
        permissions: coreServices.permissions,
        catalog: catalogServiceRef,
      },
      async init({
        logger,
        database,
        httpRouter,
        httpAuth,
        userInfo,
        auth,
        scheduler,
        cache,
        config,
        permissions,
        catalog,
      }) {
        const db = await AdoptionAnalyticsDatabase.create({ database, logger });

        const eventsQueue = new EventsQueue(db, logger);

        const collector = new EntitySnapshotCollector({
          logger,
          catalog,
          auth,
          db,
        });

        const dashboard = new AdoptionAnalyticsDashboardService({
          logger,
          db,
          catalog,
          auth,
        });

        await scheduler.scheduleTask({
          id: 'adoption-analytics-entity-snapshot',
          // Dev cadence: refresh entity snapshots every 5 minutes so
          // changes show up quickly. Bump to `{ hours: 24 }` for prod.
          frequency: { minutes: 5 },
          timeout: { minutes: 10 },
          // Run shortly after startup so first snapshot is available
          // without waiting a full interval.
          initialDelay: { seconds: 30 },
          fn: () => collector.run(),
        });

        // Drain the ingest buffer periodically so events land in the DB
        // even during quiet periods where the size-based flush never
        // trips.
        await scheduler.scheduleTask({
          id: 'adoption-analytics-events-flush',
          frequency: { seconds: 5 },
          timeout: { seconds: 30 },
          fn: () => eventsQueue.flush('scheduled'),
        });

        // Retention: prune raw events older than the configured window.
        // Keeps `insights_events` from growing unbounded and keeps the
        // dashboard aggregations fast on long-running instances.
        const retentionDays =
          config.getOptionalNumber('adoptionAnalytics.retentionDays') ?? 90;
        await scheduler.scheduleTask({
          id: 'adoption-analytics-retention',
          frequency: { hours: 24 },
          timeout: { minutes: 30 },
          initialDelay: { minutes: 2 },
          fn: async () => {
            const removed = await db.deleteEventsOlderThan(retentionDays);
            if (removed > 0) {
              logger.info(
                `adoption-analytics-backend: retention pruned ${removed} events older than ${retentionDays} days`,
              );
            }
          },
        });

        httpRouter.use(
          await createRouter({
            logger,
            db,
            dashboard,
            httpAuth,
            userInfo,
            cache,
            eventsQueue,
            permissions,
            maskSalt: config.getOptionalString(
              'adoptionAnalytics.userMaskSalt',
            ),
          }),
        );
      },
    });
  },
});
