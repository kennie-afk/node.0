import {
  CreationAttributes,
  FindOptions,
  Includeable,
  Model,
  ModelStatic,
  Op,
  Order,
  WhereOptions
} from 'sequelize';
import { currentChurchId } from './tenant-context';
import { NotFoundError } from '../utils/errors';
import { Page, Pagination, toOffset, toPage } from './pagination';
import { decodeCursor, KeysetPage, toKeysetPage } from './keyset';

export interface ListOptions {
  pagination: Pagination;
  where?: WhereOptions;
  include?: Includeable[];
  order?: Order;
}

export interface KeysetOptions {
  where?: WhereOptions;
  include?: Includeable[];
  /** Sort columns (attribute names), the last one unique (the id), each with its own direction. */
  sort: Array<[string, 'ASC' | 'DESC']>;
  limit: number;
  cursor?: string | null;
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
    const where = this.scoped(options.where);

    // Counting through a LEFT JOIN with COUNT(DISTINCT id) is the dominant cost of a plain list on a large
    // table. When no include narrows the result (none is `required`) and the filter does not reach into
    // one, the joined rows cannot change the count, so count the table alone.
    if (!narrowsByInclude(options.include, where)) {
      const rows = await this.model.findAll({ where, include: options.include, order: options.order, limit, offset });
      const count = await this.model.count({ where });
      return toPage(rows, count, options.pagination);
    }

    const { rows, count } = await this.model.findAndCountAll({
      where,
      include: options.include,
      order: options.order,
      limit,
      offset,
      distinct: true
    });

    return toPage(rows, count, options.pagination);
  }

  /**
   * Cursor paging with no count(*): fetches limit+1 rows after the cursor and returns an opaque
   * `nextCursor`. The cursor is the sort-column values of the last row seen, so deep pages cost the
   * same as the first and never skip or repeat rows when data changes. A malformed cursor is ignored
   * (restarts from the top) rather than trusted.
   */
  async listKeyset(options: KeysetOptions): Promise<KeysetPage<M>> {
    const { sort, limit } = options;
    const after = decodeCursor<unknown[]>(options.cursor);
    const clauses: WhereOptions[] = [];
    if (Array.isArray(after) && after.length === sort.length) {
      // (a > x) OR (a = x AND b > y) OR ...: strict lexicographic "after", with mixed directions.
      for (let i = 0; i < sort.length; i++) {
        const term: Record<string, unknown> = {};
        for (let j = 0; j < i; j++) term[sort[j][0]] = after[j];
        term[sort[i][0]] = { [sort[i][1] === 'ASC' ? Op.gt : Op.lt]: after[i] };
        clauses.push(term as WhereOptions);
      }
    }
    const base = this.scoped(options.where);
    const where = clauses.length ? ({ [Op.and]: [base, { [Op.or]: clauses }] } as WhereOptions) : base;
    const rows = await this.model.findAll({ where, include: options.include, order: sort.map(([c, d]) => [c, d]) as Order, limit: limit + 1 });
    return toKeysetPage(rows, limit, (row) => sort.map(([c]) => (row as any).get(c)));
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

/**
 * True when a joined table can change which rows match: an inner-joined (or filtered) include, or a
 * filter whose KEY names a joined column ("$family.name$" or "family.name"). Only keys are inspected:
 * plain values such as an email address legitimately contain dots.
 */
function narrowsByInclude(include: unknown, where: unknown): boolean {
  const joins = Array.isArray(include) ? include : include ? [include] : [];
  if (joins.some((entry) => (entry as { required?: boolean }).required === true || (entry as { where?: unknown }).where !== undefined)) return true;
  const keyReachesJoin = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.some(keyReachesJoin);
    if (node && typeof node === 'object') {
      const record = node as Record<string | symbol, unknown>;
      return [...Object.keys(record), ...Object.getOwnPropertySymbols(record)].some(
        (key) => (typeof key === 'string' && (key.startsWith('$') || key.includes('.'))) || keyReachesJoin(record[key])
      );
    }
    return false;
  };
  return keyReachesJoin(where);
}
