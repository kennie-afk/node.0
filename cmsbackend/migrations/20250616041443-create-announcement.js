

'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('announcements', {
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
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      author_user_id: { 
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false, 
        references: {
          model: 'users', 
          key: 'id',      
        },
        onUpdate: 'CASCADE',  
        onDelete: 'RESTRICT',
      },
      publication_date: { 
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'), 
      },
      expiry_date: { 
        type: Sequelize.DATE,
        allowNull: true,
      },
      is_published: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true, 
      },
      target_audience: { 
        type: Sequelize.ENUM('All', 'Members', 'Leaders', 'Specific Group'),
        allowNull: true, 
        defaultValue: 'All', 
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
    await queryInterface.dropTable('announcements');
  }
};