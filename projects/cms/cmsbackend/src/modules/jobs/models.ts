import { DataTypes, Sequelize } from 'sequelize';
import BaseModel from '../../common/base.model';
import type { ModelFactory } from '../types';

class Job extends BaseModel<any> {}
class SchedulerState extends BaseModel<any> {}

/** Mirrors migration 20260930120000-jobs-queue (which also adds the claim functions and RLS). */
const factory: ModelFactory = (sequelize: Sequelize) => {
  Job.initModel(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      churchId: { type: DataTypes.INTEGER, allowNull: true },
      type: { type: DataTypes.STRING(80), allowNull: false },
      payload: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'queued' },
      runAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      maxAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 8 },
      lastError: { type: DataTypes.TEXT, allowNull: true },
      dedupeKey: { type: DataTypes.STRING(160), allowNull: true },
      lockedBy: { type: DataTypes.STRING(80), allowNull: true },
      lockedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      finishedAt: { type: DataTypes.DATE, allowNull: true }
    },
    { underscored: true, timestamps: false, tableName: 'jobs', modelName: 'Job' },
    sequelize
  );
  SchedulerState.initModel(
    {
      name: { type: DataTypes.STRING(80), primaryKey: true },
      lastRunAt: { type: DataTypes.DATE, allowNull: false }
    },
    { underscored: true, timestamps: false, tableName: 'scheduler_state', modelName: 'SchedulerState' },
    sequelize
  );
  return { Job, SchedulerState };
};

export default factory;
