'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('small_group_members', {
      small_group_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'small_groups',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      member_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'members',
          key: 'id',
        },
        onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
      },
      role: {
        type: Sequelize.STRING(100),
        allowNull: true,
        defaultValue: 'Member',
      },
      start_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
        defaultValue: Sequelize.literal('CURRENT_DATE'),
      },
      end_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      uniqueKeys: {
        unique_small_group_member: {
          fields: ['small_group_id', 'member_id']
        }
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('small_group_members');
  }
};