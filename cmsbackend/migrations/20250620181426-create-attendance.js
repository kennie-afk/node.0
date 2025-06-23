'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('attendance', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER.UNSIGNED
      },
      member_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: {
          model: 'members',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      guest_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      attendance_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
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
      sermon_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: {
          model: 'sermons',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      attendance_type: {
        type: Sequelize.ENUM('In-person', 'Online', 'Other'),
        allowNull: false,
        defaultValue: 'In-person',
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

    await queryInterface.addConstraint('attendance', {
      fields: ['member_id', 'event_id', 'attendance_date'],
      type: 'unique',
      name: 'member_event_date_unique',
      where: {
        member_id: {
          [Sequelize.Op.ne]: null
        },
        event_id: {
          [Sequelize.Op.ne]: null
        }
      }
    });

    await queryInterface.addConstraint('attendance', {
      fields: ['guest_name', 'event_id', 'attendance_date'],
      type: 'unique',
      name: 'guest_event_date_unique',
      where: {
        guest_name: {
          [Sequelize.Op.ne]: null
        },
        event_id: {
          [Sequelize.Op.ne]: null
        }
      }
    });

    await queryInterface.addConstraint('attendance', {
      fields: ['member_id', 'sermon_id', 'attendance_date'],
      type: 'unique',
      name: 'member_sermon_date_unique',
      where: {
        member_id: {
          [Sequelize.Op.ne]: null
        },
        sermon_id: {
          [Sequelize.Op.ne]: null
        }
      }
    });

    await queryInterface.addConstraint('attendance', {
      fields: ['guest_name', 'sermon_id', 'attendance_date'],
      type: 'unique',
      name: 'guest_sermon_date_unique',
      where: {
        guest_name: {
          [Sequelize.Op.ne]: null
        },
        sermon_id: {
          [Sequelize.Op.ne]: null
        }
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('attendance', 'member_event_date_unique');
    await queryInterface.removeConstraint('attendance', 'guest_event_date_unique');
    await queryInterface.removeConstraint('attendance', 'member_sermon_date_unique');
    await queryInterface.removeConstraint('attendance', 'guest_sermon_date_unique');
    await queryInterface.dropTable('attendance');
  }
};