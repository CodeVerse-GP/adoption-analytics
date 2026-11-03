/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('insights_events', table => {
    table.string('subject', 512).notNullable().alter();
    table.string('pathname', 1024).nullable().alter();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  // An explicit PostgreSQL varchar cast can truncate values during alteration.
  // Refuse rollback while it would lose analytics data.
  const oversizedEvent = await knex('insights_events')
    .whereRaw('length(??) > ?', ['subject', 255])
    .orWhereRaw('length(??) > ?', ['pathname', 255])
    .first('id');
  if (oversizedEvent) {
    throw new Error(
      'Cannot narrow event columns: subject or pathname exceeds 255 characters',
    );
  }

  await knex.schema.alterTable('insights_events', table => {
    table.string('subject', 255).notNullable().alter();
    table.string('pathname', 255).nullable().alter();
  });
};
