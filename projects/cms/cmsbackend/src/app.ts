import 'module-alias/register';
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { env } from './config/env';
import { requestContext } from './middleware/request-context.middleware';
import { errorHandler, notFound } from './middleware/error.middleware';
import healthRoutes from './health/health.routes';

import userRoutes from '@users/user.routes';
import authRoutes from './auth/auth.routes';
import familyRoutes from '@families/family.routes';
import memberRoutes from '@members/member.routes';
import eventRoutes from '@events/event.routes';
import announcementRoutes from '@announcements/announcement.routes';
import sermonRoutes from '@sermons/sermon.routes';
import contributionRoutes from '@contributions/contribution.routes';
import attendanceRoutes from '@attendance/attendance.routes';
import ministryRoutes from '@ministries/ministry.routes';
import smallGroupRoutes from '@small_groups/small_group.routes';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestContext);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.CORS_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      credentials: true
    })
  );

  app.use('/', healthRoutes);

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use('/auth', authRoutes);
  app.use('/users', userRoutes);
  app.use('/families', familyRoutes);
  app.use('/members', memberRoutes);
  app.use('/events', eventRoutes);
  app.use('/announcements', announcementRoutes);
  app.use('/sermons', sermonRoutes);
  app.use('/contributions', contributionRoutes);
  app.use('/attendance', attendanceRoutes);
  app.use('/ministries', ministryRoutes);
  app.use('/small-groups', smallGroupRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
