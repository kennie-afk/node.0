import { Model, ModelCtor } from 'sequelize';

export abstract class BaseRepository<T extends Model> {
  protected model: ModelCtor<T>;

  constructor(model: ModelCtor<T>) {
    this.model = model;
  }

  async findById(id: number) {
    return this.model.findByPk(id, { include: [{ all: true }] });
  }

  async findAll() {
    return this.model.findAll({ include: [{ all: true }] });
  }

  async create(data: any) {
    return this.model.create(data);
  }

  async update(id: number, data: any) {
    const record = await this.findById(id);
    if (!record) throw new Error('Record not found');
    return record.update(data);
  }

  async delete(id: number) {
    const record = await this.findById(id);
    if (!record) throw new Error('Record not found');
    return record.destroy();
  }
}