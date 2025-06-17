// migrations/XXXXXXXXXXXXXX-create-sermon.js (replace XXXXXXXXXXXXXX with your actual timestamp)
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
      speaker_member_id: { // Corresponds to 'speakerMemberId' in model
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: {
          model: 'members', // References the 'members' table
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL', // If speaker member is deleted, set this FK to NULL
      },
      event_id: { // Corresponds to 'eventId' in model
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true, // Event is optional (will be auto-created by controller)
        references: {
          model: 'events', // References the 'events' table
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL', // If event is deleted, set this FK to NULL
      },
      date_preached: { // Corresponds to 'datePreached' in model
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      passage_reference: { // Corresponds to 'passageReference' in model
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      summary: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      audio_url: { // Corresponds to 'audioUrl' in model
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      video_url: { // Corresponds to 'videoUrl' in model
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