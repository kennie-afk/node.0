'use strict';

import { Sequelize } from 'sequelize';
import sequelize from '../config/database';

import { initUser, User } from '../users/user.model';
import { initFamily, Family } from '../families/family.model';
import { initMember, Member } from '../members/member.model';
import { initEvent, Event } from '../events/event.model';
import { initAnnouncement, Announcement } from '../announcements/announcement.model';
import { initSermon, Sermon } from '../sermons/sermon.model';
import { initContribution, Contribution } from '../contributions/contribution.model';
import { initAttendance, Attendance } from '../attendance/attendance.model';
import { initMinistry, Ministry } from '../ministries/ministry.model';
import { initMinistryMember, MinistryMember } from '../ministries/ministry_member.model';
import { initSmallGroup, SmallGroup } from '../small_groups/small_group.model';
import { initSmallGroupMember, SmallGroupMember } from '../small_groups/small_group_member.model';

interface Db {
  sequelize: Sequelize;
  User: typeof User;
  Family: typeof Family;
  Member: typeof Member;
  Event: typeof Event;
  Announcement: typeof Announcement;
  Sermon: typeof Sermon;
  Contribution: typeof Contribution;
  Attendance: typeof Attendance;
  Ministry: typeof Ministry;
  MinistryMember: typeof MinistryMember;
  SmallGroup: typeof SmallGroup;
  SmallGroupMember: typeof SmallGroupMember;
  [key: string]: any;
}

const db: Db = {} as Db;
db.sequelize = sequelize;

initUser(sequelize);
initFamily(sequelize);
initMember(sequelize);
initEvent(sequelize);
initAnnouncement(sequelize);
initSermon(sequelize);
initContribution(sequelize);
initAttendance(sequelize);
initMinistry(sequelize);
initMinistryMember(sequelize);
initSmallGroup(sequelize);
initSmallGroupMember(sequelize);

db.User = User;
db.Family = Family;
db.Member = Member;
db.Event = Event;
db.Announcement = Announcement;
db.Sermon = Sermon;
db.Contribution = Contribution;
db.Attendance = Attendance;
db.Ministry = Ministry;
db.MinistryMember = MinistryMember;
db.SmallGroup = SmallGroup;
db.SmallGroupMember = SmallGroupMember;

Object.values(db).forEach(model => {
  if (model && 'associate' in model && typeof model.associate === 'function') {
    model.associate(db);
  }
});

export default db;