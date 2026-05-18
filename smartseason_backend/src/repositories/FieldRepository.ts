import { Field } from '../models/Field.model';
import { BaseRepository } from './BaseRepository';

export class FieldRepository extends BaseRepository<Field> {
  constructor() {
    super(Field);
  }

  async findByAgentId(agentId: number) {
    return Field.findAll({
      where: { assignedAgentId: agentId },
      include: ['observations', 'assignedAgent']
    });
  }
}