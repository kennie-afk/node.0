import { Sequelize, DataTypes } from 'sequelize';
import { env, isProduction } from '../config/env';

import churchInit from '../churches/church.model';
import announcementInit from '@announcements/announcement.model';
import userInit from '@users/user.model';
import familyInit from '@families/family.model';
import memberInit from '@members/member.model';
import eventInit from '@events/event.model';
import sermonInit from '@sermons/sermon.model';
import contributionInit from '@contributions/contribution.model';
import attendanceInit from '@attendance/attendance.model';
import ministryInit from '@ministries/ministry.model';
import smallGroupInit from '@small_groups/small_group.model';
import ministryMemberInit from '@ministries/ministry_member.model';
import smallGroupMemberInit from '@small_groups/small_group_member.model';

const isSqlite = env.DATABASE_URL.startsWith('sqlite');

const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: isSqlite ? 'sqlite' : 'postgres',
  logging: false,
  pool: {
    max: isProduction ? 20 : 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  dialectOptions:
    !isSqlite && env.DATABASE_SSL
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : {}
});

export const Church = churchInit(sequelize) as any;
export const Announcement = announcementInit(sequelize) as any;
export const User = userInit(sequelize) as any;
export const Family = familyInit(sequelize) as any;
export const Member = memberInit(sequelize) as any;
export const Event = eventInit(sequelize) as any;
export const Sermon = sermonInit(sequelize) as any;
export const Contribution = contributionInit(sequelize) as any;
export const Attendance = attendanceInit(sequelize) as any;
export const Ministry = ministryInit(sequelize) as any;
export const SmallGroup = smallGroupInit(sequelize) as any;
export const MinistryMember = ministryMemberInit(sequelize, DataTypes) as any;
export const SmallGroupMember = smallGroupMemberInit(sequelize, DataTypes) as any;

const models = {
  Church,
  Announcement,
  User,
  Family,
  Member,
  Event,
  Sermon,
  Contribution,
  Attendance,
  Ministry,
  SmallGroup,
  MinistryMember,
  SmallGroupMember
};

Object.values(models).forEach((model: any) => {
  if (model.associate) {
    model.associate(models);
  }
});

const db = {
  sequelize,
  Sequelize,
  Church,
  Announcement,
  User,
  Family,
  Member,
  Event,
  Sermon,
  Contribution,
  Attendance,
  Ministry,
  SmallGroup,
  MinistryMember,
  SmallGroupMember
};

export default db;