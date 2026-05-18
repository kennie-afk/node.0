import sequelize from './models/index';
import { AuthService } from './services/AuthService';

const seedDatabase = async () => {
  const authService = new AuthService();

  try {
    await authService.register('SmartSeason Admin', 'admin@smartseason.com', 'admin123', 'ADMIN');
    console.log('Admin user created: admin@smartseason.com / admin123');

    await authService.register('Field Agent One', 'agent@smartseason.com', 'agent123', 'FIELD_AGENT');
    console.log('Field Agent created: agent@smartseason.com / agent123');

    console.log('Demo users seeded successfully');
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      console.log('Users already exist');
    } else {
      console.error('Seeding failed:', error.message);
    }
  }
};

seedDatabase().then(() => {
  process.exit(0);
});