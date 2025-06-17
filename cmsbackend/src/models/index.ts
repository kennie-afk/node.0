import { Sequelize } from 'sequelize';
import sequelize from '../config/database';

import { initUser, User } from '../users/user.model';
import { initFamily, Family } from '../families/family.model';
import { initMember, Member } from '../members/member.model';
import { initEvent, Event } from '../events/event.model'; 
import { initAnnouncement, Announcement } from '../announcements/announcement.model'; 
import { initSermon, Sermon } from '../sermons/sermon.model'; 

interface Db {
  sequelize: Sequelize;
  User: typeof User;
  Family: typeof Family;
  Member: typeof Member;
  Event: typeof Event;
  Announcement: typeof Announcement; 
  Sermon: typeof Sermon; 
}

const db: Db = {} as Db;
db.sequelize = sequelize;

initUser(sequelize);
initFamily(sequelize);
initMember(sequelize);
initEvent(sequelize); 
initAnnouncement(sequelize);
initSermon(sequelize); 
db.User = User;
db.Family = Family;
db.Member = Member;
db.Event = Event;
db.Announcement = Announcement; 
db.Sermon = Sermon; 

Object.values(db).forEach(model => {
  if ('associate' in model && typeof model.associate === 'function') {
    model.associate(db);
  }
});

export default db;