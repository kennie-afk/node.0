import express from 'express';          
import db from '@models';                 
import userRoutes from '@routes/user.routes'; 
import familyRoutes from '@routes/family.routes'; 
import memberRoutes from '@routes/member.routes'; 

const app = express();                    
const PORT = process.env.PORT || 3000;     

app.use(express.json());


app.get('/', async (req, res) => {
  try {
    const userCount = await db.User.count();
    const familyCount = await db.Family.count();
    const memberCount = await db.Member.count(); 

    res.status(200).json({
      message: `Welcome to Church CMS Backend! Database connected (MySQL).`,
      usersInDb: userCount,
      familiesInDb: familyCount,
      membersInDb: memberCount,
    });
  } catch (error) {
    console.error('Error fetching counts:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.use('/users', userRoutes);

app.use('/families', familyRoutes);

app.use('/members', memberRoutes);


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