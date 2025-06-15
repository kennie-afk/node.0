'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('members', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER.UNSIGNED
      },
      first_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      last_name: { 
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      middle_name: { 
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      gender: {
        type: Sequelize.ENUM('Male', 'Female', 'Other'), 
        allowNull: true,
      },
      date_of_birth: { 
        type: Sequelize.DATEONLY, 
        allowNull: true,
      },
      email: {
        type: Sequelize.STRING(100),
        allowNull: true,
        unique: true, 
      },
      phone_number: {
        type: Sequelize.STRING(20),
        allowNull: true,
        unique: true, 
      },
      address: { 
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      city: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      county: { 
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      postal_code: { 
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('Active', 'Inactive', 'New Convert', 'Deceased', 'Guest'), 
        allowNull: false,
        defaultValue: 'Active', 
      },
      baptism_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      membership_date: { 
        type: Sequelize.DATEONLY,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_DATE'), 
      },
      family_id: { 
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true, 
        references: { 
          model: 'families', 
          key: 'id',        
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      profile_picture_url: { 
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
    await queryInterface.dropTable('members');
  }
};