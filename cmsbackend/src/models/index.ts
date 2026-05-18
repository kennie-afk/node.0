import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';

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

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'church_cms_db',
  process.env.DB_USER || 'church_admin',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV !== 'production',
    dialectOptions: {
      ssl: false,
    },
  }
);


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


Announcement.associate?.(models);
User.associate?.(models);
Family.associate?.(models);
Member.associate?.(models);
Event.associate?.(models);
Sermon.associate?.(models);
Contribution.associate?.(models);
Attendance.associate?.(models);   
Ministry.associate?.(models);
SmallGroup.associate?.(models);
MinistryMember.associate?.(models);
SmallGroupMember.associate?.(models);

const db = {
  sequelize,
  Sequelize,
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