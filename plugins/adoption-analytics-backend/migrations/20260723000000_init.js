/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('insights_events', table => {
    table.increments('id');
    table.string('user_ref').notNullable().index();
    table.string('action').notNullable().index();
    table.string('subject').notNullable();
    table.string('plugin_id').nullable();
    table.string('pathname').nullable();
    table.double('value').nullable();
    table.timestamp('timestamp').notNullable().index();
    // Client-generated (persisted in the browser's sessionStorage), giving an
    // accurate session boundary without heuristics like "30 minutes of
    // inactivity". Nullable — the aggregator falls back to a synthetic
    // (userRef, day) session when it's missing.
    table.string('session_id').nullable();

    // Composite index accelerates the dashboard's dominant read pattern:
    // scan filtered by `timestamp >= X` and optionally by `action` (e.g.
    // sign-in for the logins list, navigate for top entities). Individual
    // indexes on the columns don't cover this well.
    table.index(['timestamp', 'action'], 'insights_events_ts_action_idx');
  });

  await knex.schema.createTable('insights_entity_snapshots', table => {
    table.increments('id');
    // ISO date (YYYY-MM-DD) — one row per (date, kind, type).
    table.string('date').notNullable();
    table.string('kind').notNullable();
    // `spec.type` (service / website / openapi / ...) so the dashboard can
    // break entity counts down by both kind and type. Empty string means
    // "untyped", which keeps a per-kind total meaningful.
    table.string('type').notNullable().defaultTo('');
    table.integer('count').notNullable();
    table.unique(['date', 'kind', 'type']);
    table.index('date');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  await knex.schema.dropTable('insights_entity_snapshots');
  await knex.schema.dropTable('insights_events');
};
