import sequelize from '../config/database';
import User from './User.model';
import Field from './Field.model';
import FieldObservation from './FieldObservation.model';

User.hasMany(Field, { foreignKey: 'assignedAgentId', as: 'assignedFields' });
Field.belongsTo(User, { foreignKey: 'assignedAgentId', as: 'assignedAgent' });

User.hasMany(FieldObservation, { foreignKey: 'createdById', as: 'observations' });
FieldObservation.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });

Field.hasMany(FieldObservation, { foreignKey: 'fieldId', as: 'observations' });
FieldObservation.belongsTo(Field, { foreignKey: 'fieldId' });

export { sequelize, User, Field, FieldObservation };
export default sequelize;