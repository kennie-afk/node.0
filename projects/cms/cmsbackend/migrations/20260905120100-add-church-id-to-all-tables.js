'use strict';

const TENANT_TABLES = [
  'users',
  'families',
  'members',
  'events',
  'announcements',
  'sermons',
  'contribution',
  'contributions',
  'attendance',
  'ministries',
  'ministry_members',
  'small_groups',
  'small_group_members'
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [existing] = await queryInterface.sequelize.query(
      "SELECT id FROM churches WHERE slug = 'default' LIMIT 1"
    );

    let defaultChurchId;
    if (existing.length > 0) {
      defaultChurchId = existing[0].id;
    } else {
      const [inserted] = await queryInterface.sequelize.query(
        `INSERT INTO churches (name, slug, timezone, is_active, created_at, updated_at)
         VALUES ('Default Church', 'default', 'Africa/Nairobi', true, NOW(), NOW())
         RETURNING id`
      );
      defaultChurchId = inserted[0].id;
    }

    const [present] = await queryInterface.sequelize.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    );
    const presentTables = new Set(present.map((row) => row.tablename));

    for (const table of TENANT_TABLES) {
      if (!presentTables.has(table)) {
        continue;
      }

      const description = await queryInterface.describeTable(table);
      if (description.church_id) {
        continue;
      }

      await queryInterface.addColumn(table, 'church_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'churches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      });

      await queryInterface.sequelize.query(
        `UPDATE "${table}" SET church_id = ${defaultChurchId} WHERE church_id IS NULL`
      );

      await queryInterface.changeColumn(table, 'church_id', {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'churches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      });

      await queryInterface.addIndex(table, ['church_id'], {
        name: `${table}_church_id_idx`
      });
    }
  },

  async down(queryInterface) {
    for (const table of TENANT_TABLES) {
      await queryInterface.removeIndex(table, `${table}_church_id_idx`).catch(() => {});
      await queryInterface.removeColumn(table, 'church_id').catch(() => {});
    }
  }
};
