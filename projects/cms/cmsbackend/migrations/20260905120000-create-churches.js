'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('churches', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      name: { type: Sequelize.STRING(150), allowNull: false },
      slug: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      timezone: { type: Sequelize.STRING(60), allowNull: false, defaultValue: 'Africa/Nairobi' },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') }
    });

    await queryInterface.addIndex('churches', ['slug'], {
      unique: true,
      name: 'churches_slug_unique'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('churches');
  }
};
