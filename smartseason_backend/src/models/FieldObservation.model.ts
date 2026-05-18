import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import Field from './Field.model';
import User from './User.model';

export interface FieldObservationAttributes {
  id?: number;
  fieldId: number;
  stage: 'PLANTED' | 'GROWING' | 'READY' | 'HARVESTED';
  notes?: string;
  createdById: number;
}

export class FieldObservation extends Model<FieldObservationAttributes> implements FieldObservationAttributes {
  public id!: number;
  public fieldId!: number;
  public stage!: 'PLANTED' | 'GROWING' | 'READY' | 'HARVESTED';
  public notes?: string;
  public createdById!: number;
}

FieldObservation.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    fieldId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'fields',
        key: 'id',
      },
    },
    stage: {
      type: DataTypes.ENUM('PLANTED', 'GROWING', 'READY', 'HARVESTED'),
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdById: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
  },
  {
    sequelize,
    modelName: 'FieldObservation',
    tableName: 'field_observations',
  }
);

export default FieldObservation;