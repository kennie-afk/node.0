import { Model, Sequelize } from 'sequelize';

export default class BaseModel<TAttributes extends object, TCreationAttributes extends object = TAttributes> extends Model<TAttributes, TCreationAttributes> {
  public static initModel(attributes: any, options: any, sequelize: Sequelize) {
    return this.init(attributes, { ...options, sequelize });
  }
}