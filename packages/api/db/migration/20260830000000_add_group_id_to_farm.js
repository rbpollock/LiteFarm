export const up = async function (knex) {
  await knex.schema.alterTable('farm', (table) => {
    table.string('group_id').nullable();
    table.index('group_id');
  });
};

export const down = async function (knex) {
  await knex.schema.alterTable('farm', (table) => {
    table.dropColumn('group_id');
  });
};
