'use strict';

/** Links a sign-in account to the member it belongs to, so /me can show that person's own data. */
module.exports = {
  async up(qi) {
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql) => qi.sequelize.query(sql, { transaction });
      await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS member_id integer`);
      await q(`ALTER TABLE users ADD CONSTRAINT users_member_fk FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id) ON DELETE SET NULL (member_id)`);
      await q(`CREATE UNIQUE INDEX users_church_member_unique ON users (church_id, member_id) WHERE member_id IS NOT NULL`);
    });
  },
  async down(qi) {
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql) => qi.sequelize.query(sql, { transaction });
      await q(`DROP INDEX IF EXISTS users_church_member_unique`);
      await q(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_member_fk`);
      await q(`ALTER TABLE users DROP COLUMN IF EXISTS member_id`);
    });
  }
};
