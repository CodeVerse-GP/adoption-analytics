import type { AuthService, LoggerService } from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import type {
  EntityCountRow,
  AdoptionAnalyticsDatabase,
} from './AdoptionAnalyticsDatabase';

type Options = {
  logger: LoggerService;
  catalog: CatalogService;
  auth: AuthService;
  db: AdoptionAnalyticsDatabase;
};

/**
 * Runs periodically to snapshot catalog entity counts grouped by
 * `(kind, spec.type)`. One snapshot per UTC day; re-runs on the same day
 * overwrite the previous value so a restart late in the day still yields
 * the freshest count.
 */
export class EntitySnapshotCollector {
  constructor(private readonly options: Options) {}

  async run(): Promise<void> {
    const { logger, catalog, auth, db } = this.options;
    logger.info('adoption-analytics-backend: collecting entity count snapshot');

    const credentials = await auth.getOwnServiceCredentials();
    // No `fields` projection: some catalog backends strip `spec.type`
    // or the entire `spec` block when a projection is requested, which
    // caused entities to show up as "untyped" even when their type was
    // clearly set in the catalog UI. Full entities are cheap enough for
    // a 5-min scheduled task, and this guarantees we see every field.
    const { items } = await catalog.getEntities({}, { credentials });

    // Group by `${kind}||${type}` so a numerical `type` (unusual but
    // legal per the catalog spec) can't collide with an actual kind
    // name via naive concatenation. Empty string means "no type set".
    const buckets = new Map<string, EntityCountRow>();
    for (const entity of items) {
      const kind = entity.kind;
      const rawType = (entity.spec as { type?: unknown } | undefined)?.type;
      // Trim the value so entities with a whitespace-only `spec.type`
      // (e.g. `' '`) collapse into the same untyped bucket rather than
      // producing a legend entry with an invisible label.
      const type = typeof rawType === 'string' ? rawType.trim() : '';
      const key = `${kind}||${type}`;
      const cur = buckets.get(key);
      if (cur) cur.count += 1;
      else buckets.set(key, { kind, type, count: 1 });
    }

    const date = new Date().toISOString().slice(0, 10);
    await db.upsertEntitySnapshot(date, [...buckets.values()]);

    // Include the actual (kind, type) breakdown in the log so operators
    // can verify at a glance which types were captured — otherwise the
    // only way to check is to wait for the 5-min response cache to
    // expire and refresh the dashboard.
    const breakdown = [...buckets.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .map(b => `${b.kind}/${b.type || 'untyped'}=${b.count}`)
      .join(', ');
    logger.info(
      `adoption-analytics-backend: snapshot ${date} stored (${buckets.size} kind/type combos, ${items.length} entities): ${breakdown}`,
    );

    // Diagnostic: if a kind has every entity coming back as untyped,
    // dump a sample entity's spec so operators can see whether the raw
    // catalog data actually contains `spec.type` — helps distinguish a
    // projection problem from an entity-data problem.
    const kindTypeMap = new Map<string, Set<string>>();
    for (const { kind, type } of buckets.values()) {
      const set = kindTypeMap.get(kind) ?? new Set<string>();
      set.add(type);
      kindTypeMap.set(kind, set);
    }
    for (const [kind, types] of kindTypeMap) {
      if (types.size === 1 && types.has('')) {
        const sample = items.find(e => e.kind === kind);
        logger.warn(
          `adoption-analytics-backend: kind '${kind}' has no entities with spec.type. Sample spec: ${JSON.stringify(
            sample?.spec ?? null,
          )}`,
        );
      }
    }
  }
}
