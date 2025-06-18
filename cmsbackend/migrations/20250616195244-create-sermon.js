'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sermons', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER.UNSIGNED
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      speaker_member_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: {
          model: 'members', 
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL', 
      },
      event_id: { 
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true, 
        references: {
          model: 'events',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      date_preached: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      passage_reference: { 
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      summary: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      audio_url: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      video_url: { 
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
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
        collate: 'utf8mb4_unicode_ci'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('sermons');
  }
};