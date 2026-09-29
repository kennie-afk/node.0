import { Includeable, Model, ModelStatic, Order, WhereOptions } from 'sequelize';
import { TenantRepository } from './tenant-repository';
import { Page, Pagination } from './pagination';
import { BadRequestError } from '../utils/errors';

export interface CrudOptions {
  include?: Includeable[];
  order?: Order;
  /**
   * Foreign keys the caller may set, mapped to the model they point at. A row may only
   * reference rows of the caller's own church; the database foreign key alone cannot
   * enforce that, since ids are global.
   */
  references?: Record<string, { model: ModelStatic<Model>; label: string }>;
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

  async function assertReferencesInChurch(payload: Record<string, unknown>): Promise<void> {
    for (const [field, target] of Object.entries(options.references ?? {})) {
      const value = payload[field];
      if (value === undefined || value === null) {
        continue;
      }
      const exists = await new TenantRepository<any>(target.model, target.label).exists({ id: value as number });
      if (!exists) {
        throw new BadRequestError(`${field} does not refer to a ${target.label.toLowerCase()} in this church`);
      }
    }
  }

  return {
    repository,

    async create(payload) {
      await assertReferencesInChurch(payload as Record<string, unknown>);
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
      await assertReferencesInChurch(changes as Record<string, unknown>);
      await repository.update(id, changes as any);
      return repository.findByIdOrFail(id, { include: options.include }) as Promise<T>;
    },

    async remove(id) {
      await repository.destroy(id);
    }
  };
}
