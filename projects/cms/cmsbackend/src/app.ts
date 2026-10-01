import 'module-alias/register';
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { env } from './config/env';
import { generalLimiter, loginLimiter } from './middleware/rate-limit.middleware';
import { requestContext } from './middleware/request-context.middleware';
import { metricsMiddleware } from './common/metrics';
import { errorHandler, notFound } from './middleware/error.middleware';
import { ApiError } from './utils/errors';
import healthRoutes from './health/health.routes';
import churchRoutes from './churches/church.routes';

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
import { routeMounts } from './modules/route-registry';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestContext);
  app.use(metricsMiddleware);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.CORS_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        return callback(new ApiError('Origin not allowed', 403));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
      exposedHeaders: ['Idempotent-Replayed', 'Content-Disposition', 'X-Request-Id', 'RateLimit-Remaining'],
      credentials: true
    })
  );

  app.use('/', healthRoutes);

  // Safaricom callbacks come from a few shared IPs in bursts; they authenticate by signed path.
  app.use((req, res, next) => (req.path.startsWith('/mpesa/') ? next() : generalLimiter(req, res, next)));

  app.use('/churches', churchRoutes);
  app.use('/auth/login', loginLimiter);
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
  for (const mount of routeMounts) {
    app.use(mount.path, mount.router);
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
