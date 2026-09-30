import { Sequelize, DataTypes, Options } from 'sequelize';
import pg from 'pg';
import { env, isProduction } from '../config/env';
import { captureRawTransaction, installTenantTransactions } from '../common/tenant-db';
import { modelFactories } from '../modules/model-registry';

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

// BIGINT ids and minor-unit amounts come back from node-postgres as strings by default. Every
// amount is capped well inside Number.MAX_SAFE_INTEGER (see common/money.ts), so parse them.
pg.types.setTypeParser(20, (value: string) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`bigint ${value} does not fit a safe integer`);
  }
  return parsed;
});

function parseUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '')
  };
}

const dialectOptions: Record<string, unknown> =
  !isSqlite && env.DATABASE_SSL ? { ssl: { require: true, rejectUnauthorized: false } } : {};
if (!isSqlite && env.DB_STATEMENT_TIMEOUT_MS > 0) {
  // A runaway query is cut off by the server instead of pinning a pooled connection.
  dialectOptions.statement_timeout = env.DB_STATEMENT_TIMEOUT_MS;
  dialectOptions.idle_in_transaction_session_timeout = env.DB_STATEMENT_TIMEOUT_MS * 2;
}

const baseOptions: Options = {
  dialect: isSqlite ? 'sqlite' : 'postgres',
  logging: false,
  pool: {
    max: isProduction ? env.DB_POOL_MAX : 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  dialectOptions
};

function build(): Sequelize {
  if (!isSqlite && env.DATABASE_REPLICA_URLS.length > 0) {
    // Reads marked replica-safe (reports, dashboards) go to a replica; writes and every read
    // inside a write path stay on the primary.
    return new Sequelize({
      ...baseOptions,
      replication: {
        write: parseUrl(env.DATABASE_URL),
        read: env.DATABASE_REPLICA_URLS.map(parseUrl)
      }
    });
  }
  return new Sequelize(env.DATABASE_URL, baseOptions);
}

const sequelize = build();
captureRawTransaction(sequelize);
installTenantTransactions(sequelize);

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

const models: Record<string, any> = {
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

for (const factory of modelFactories) {
  Object.assign(models, factory(sequelize));
}

Object.values(models).forEach((model: any) => {
  if (model.associate) {
    model.associate(models);
  }
});

const db: Record<string, any> & { sequelize: Sequelize; Sequelize: typeof Sequelize } = {
  sequelize,
  Sequelize,
  ...models
};

export default db;
