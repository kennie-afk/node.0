import 'module-alias/register';
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import db from '@models';
import { ApiError } from './utils/errors';

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

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  'http://localhost:5173',
  'https://church-cms-seven.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean) as string[];

app.use(express.json());

app.use(
  helmet()
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
  })
);

app.get('/', async (req, res) => {
  try {
    const counts = {
      usersInDb: await db.User.count(),
      familiesInDb: await db.Family.count(),
      membersInDb: await db.Member.count(),
      eventsInDb: await db.Event.count(),
      announcementsInDb: await db.Announcement.count(),
      sermonsInDb: await db.Sermon.count(),
      contributionsInDb: await db.Contribution.count(),
      attendanceInDb: await db.Attendance.count(),
      ministriesInDb: await db.Ministry.count(),
      smallGroupsInDb: await db.SmallGroup.count()
    };

    res.status(200).json({
      message: 'Welcome to Church CMS Backend!',
      ...counts
    });
  } catch {
    res.status(200).json({
      message: 'Welcome to Church CMS Backend!',
      database: 'Connected'
    });
  }
});

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

app.use((err: any, req: any, res: any, next: any) => {
  console.error(err.stack);

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      message: err.message
    });
  }

  res.status(500).json({
    message: 'Internal Server Error'
  });
});

async function startServer() {
  try {
    await db.sequelize.authenticate();

    await db.sequelize.sync({ alter: true });

    console.log('Database connected and synced');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();