import {
  CreationAttributes,
  FindOptions,
  Includeable,
  Model,
  ModelStatic,
  Order,
  WhereOptions
} from 'sequelize';
import { currentChurchId } from './tenant-context';
import { NotFoundError } from '../utils/errors';
import { Page, Pagination, toOffset, toPage } from './pagination';

export interface ListOptions {
  pagination: Pagination;
  where?: WhereOptions;
  include?: Includeable[];
  order?: Order;
}

export class TenantRepository<M extends Model> {
  private readonly model: ModelStatic<M>;
  private readonly label: string;

  constructor(model: ModelStatic<M>, label: string) {
    this.model = model;
    this.label = label;
  }

  private scoped(where?: WhereOptions): WhereOptions {
    return { ...(where ?? {}), churchId: currentChurchId() } as WhereOptions;
  }

  async list(options: ListOptions): Promise<Page<M>> {
    const { limit, offset } = toOffset(options.pagination);

    const { rows, count } = await this.model.findAndCountAll({
      where: this.scoped(options.where),
      include: options.include,
      order: options.order,
      limit,
      offset,
      distinct: true
    });

    return toPage(rows, count, options.pagination);
  }

  async findById(id: number, options: Omit<FindOptions, 'where'> = {}): Promise<M | null> {
    return this.model.findOne({ ...options, where: this.scoped({ id } as WhereOptions) });
  }

  async findByIdOrFail(id: number, options: Omit<FindOptions, 'where'> = {}): Promise<M> {
    const found = await this.findById(id, options);
    if (!found) {
      throw new NotFoundError(`${this.label} ${id} was not found in this church`);
    }
    return found;
  }

  async findOne(where: WhereOptions, options: Omit<FindOptions, 'where'> = {}): Promise<M | null> {
    return this.model.findOne({ ...options, where: this.scoped(where) });
  }

  async count(where?: WhereOptions): Promise<number> {
    return this.model.count({ where: this.scoped(where) });
  }

  async exists(where: WhereOptions): Promise<boolean> {
    return (await this.count(where)) > 0;
  }

  async create(payload: Omit<CreationAttributes<M>, 'churchId'>): Promise<M> {
    return this.model.create({
      ...(payload as CreationAttributes<M>),
      churchId: currentChurchId()
    } as CreationAttributes<M>);
  }

  async update(id: number, changes: Partial<CreationAttributes<M>>): Promise<M> {
    const record = await this.findByIdOrFail(id);
    const { churchId: _ignored, ...safe } = changes as Record<string, unknown>;
    return record.update(safe as Partial<CreationAttributes<M>>);
  }

  async destroy(id: number): Promise<void> {
    const record = await this.findByIdOrFail(id);
    await record.destroy();
  }
}
