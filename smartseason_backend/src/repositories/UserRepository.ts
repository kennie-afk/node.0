import { User } from '../models/User.model';
import { BaseRepository } from './BaseRepository';

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(User);
  }

  async findByEmail(email: string) {
    return User.findOne({ where: { email } });
  }
}