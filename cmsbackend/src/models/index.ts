import { Sequelize } from 'sequelize';
import sequelize from '../config/database'; 
import { initUser, User } from './user';      
import { initFamily, Family } from './family'; 
import { initMember, Member } from './member';

interface Db {
  sequelize: Sequelize;
  User: typeof User;
  Family: typeof Family;
  Member: typeof Member; 
  
}

const db: Db = {} as Db;
db.sequelize = sequelize;

initUser(sequelize);
initFamily(sequelize);
initMember(sequelize);

db.User = User;
db.Family = Family;
db.Member = Member; 


Object.values(db).forEach(model => {
  if ('associate' in model && typeof model.associate === 'function') {
    model.associate(db); 
  }
});

export default db; 