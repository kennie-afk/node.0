import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export interface FieldAttributes {
  id?: number;
  name: string;
  cropType: string;
  plantingDate: Date;
  currentStage: 'PLANTED' | 'GROWING' | 'READY' | 'HARVESTED';
  assignedAgentId?: number;
  status?: 'ACTIVE' | 'AT_RISK' | 'COMPLETED';
  createdAt?: Date;
  updatedAt?: Date;
  observations?: any[];
  assignedAgent?: any;
}

export class Field extends Model<FieldAttributes> implements FieldAttributes {
  public id!: number;
  public name!: string;
  public cropType!: string;
  public plantingDate!: Date;
  public currentStage!: 'PLANTED' | 'GROWING' | 'READY' | 'HARVESTED';
  public assignedAgentId?: number;
  public status?: 'ACTIVE' | 'AT_RISK' | 'COMPLETED';
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public observations?: any[];
  public assignedAgent?: any;
}

Field.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    cropType: { type: DataTypes.STRING, allowNull: false },
    plantingDate: { type: DataTypes.DATEONLY, allowNull: false },
    currentStage: { 
      type: DataTypes.ENUM('PLANTED', 'GROWING', 'READY', 'HARVESTED'), 
      allowNull: false, 
      defaultValue: 'PLANTED' 
    },
    assignedAgentId: { 
      type: DataTypes.INTEGER, 
      allowNull: true 
    },
    status: { 
      type: DataTypes.ENUM('ACTIVE', 'AT_RISK', 'COMPLETED'), 
      allowNull: false, 
      defaultValue: 'ACTIVE' 
    },
  },
  {
    sequelize,
    modelName: 'Field',
    tableName: 'fields',
    timestamps: true,
  }
);

export default Field;