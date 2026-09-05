import { Includeable, Model, ModelStatic, Order, WhereOptions } from 'sequelize';
import { TenantRepository } from './tenant-repository';
import { Page, Pagination } from './pagination';

export interface CrudOptions {
  include?: Includeable[];
  order?: Order;
}

export interface CrudService<T> {
  repository: TenantRepository<any>;
  create(payload: Partial<T>): Promise<T>;
  list(pagination: Pagination, where?: WhereOptions): Promise<Page<T>>;
  findById(id: number): Promise<T | null>;
  findByIdOrFail(id: number): Promise<T>;
  update(id: number, changes: Partial<T>): Promise<T>;
  remove(id: number): Promise<void>;
}

export function createCrudService<T>(
  model: ModelStatic<Model>,
  label: string,
  options: CrudOptions = {}
): CrudService<T> {
  const repository = new TenantRepository<any>(model, label);

  return {
    repository,

    async create(payload) {
      const created = await repository.create(payload as any);
      return (await repository.findByIdOrFail((created as any).id, {
        include: options.include
      })) as T;
    },

    async list(pagination, where) {
      return repository.list({
        pagination,
        where,
        include: options.include,
        order: options.order
      }) as Promise<Page<T>>;
    },

    async findById(id) {
      return repository.findById(id, { include: options.include }) as Promise<T | null>;
    },

    async findByIdOrFail(id) {
      return repository.findByIdOrFail(id, { include: options.include }) as Promise<T>;
    },

    async update(id, changes) {
      await repository.update(id, changes as any);
      return repository.findByIdOrFail(id, { include: options.include }) as Promise<T>;
    },

    async remove(id) {
      await repository.destroy(id);
    }
  };
}
