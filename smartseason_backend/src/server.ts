import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import sequelize from './models/index';
import { authRouter } from './routes/auth.routes';
import { fieldRouter } from './routes/field.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import errorHandler from './middleware/error.middleware';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/fields', fieldRouter);
app.use('/api/v1/dashboard', dashboardRouter);

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'OK' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    await sequelize.sync({ alter: true });
    console.log('Models synchronized');

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
};

startServer();