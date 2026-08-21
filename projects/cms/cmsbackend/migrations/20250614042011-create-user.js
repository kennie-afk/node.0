'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', { 
      id: {
        allowNull: false,        
        autoIncrement: true,    
        primaryKey: true,        
        type: Sequelize.INTEGER 
      },
      username: {
        type: Sequelize.STRING(50), 
        allowNull: false,          
        unique: true              
      },
      email: {
        type: Sequelize.STRING(100), 
        allowNull: false,           
        unique: true               
      },
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false            
      },
      is_admin: { 
        type: Sequelize.BOOLEAN,    
        allowNull: false,           
        defaultValue: true          
      },
      created_at: { 
        allowNull: false,
        type: Sequelize.DATE,        
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') 
      },
      updated_at: { 
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') 
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('users'); 
  }
};