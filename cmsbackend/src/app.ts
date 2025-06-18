import express from 'express';
import db from '@models';

import userRoutes from '@users/user.routes';
import familyRoutes from '@families/family.routes';
import memberRoutes from '@members/member.routes';
import eventRoutes from '@events/event.routes';
import announcementRoutes from '@announcements/announcement.routes';
import sermonRoutes from '@sermons/sermon.routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', async (req, res) => {
  try {
    const userCount = await db.User.count();
    const familyCount = await db.Family.count();
    const memberCount = await db.Member.count();
    const eventCount = await db.Event.count();
    const announcementCount = await db.Announcement.count();
    const sermonCount = await db.Sermon.count();

    res.status(200).json({
      message: `Welcome to Church CMS Backend! MySQL Database connected.`,
      usersInDb: userCount,
      familiesInDb: familyCount,
      membersInDb: memberCount,
      eventsInDb: eventCount,
      announcementsInDb: announcementCount,
      sermonsInDb: sermonCount,
    });
  } catch (error) {
    console.error('Error fetching counts:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.use('/users', userRoutes);
app.use('/families', familyRoutes);
app.use('/members', memberRoutes);
app.use('/events', eventRoutes); 
app.use('/announcements', announcementRoutes);
app.use('/sermons', sermonRoutes);

async function startServer() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connection has been established successfully.');

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Access the server at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Unable to connect to the database or start server:', error);
    process.exit(1);
  }
}

startServer();