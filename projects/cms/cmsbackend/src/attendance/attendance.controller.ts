import { NextFunction, Request, Response } from 'express';
import { Op, WhereOptions } from 'sequelize';
import db from '@models';
import { createCrudController } from '../common/crud-controller';
import { paginationSchema } from '../common/pagination';
import service from './attendance.service';

const controller = createCrudController(service, 'Attendance');

/** Whole-number query value, or undefined when absent or not a positive integer. */
const idParam = (raw: unknown): number | undefined => {
  const n = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : undefined;
  return n && n > 0 ? n : undefined;
};

/**
 * Filters and search for the list, all run by the database:
 *  eventId / sermonId / memberId  exact match
 *  kind=event | sermon            only records tied to some event / sermon
 *  q                              guest name, or the member's first or last name
 */
export function attendanceWhere(query: Request['query']): WhereOptions | undefined {
  const and: WhereOptions[] = [];
  for (const key of ['eventId', 'sermonId', 'memberId'] as const) {
    const id = idParam(query[key]);
    if (id) and.push({ [key]: id });
  }
  if (query.kind === 'event') and.push({ eventId: { [Op.ne]: null } });
  if (query.kind === 'sermon') and.push({ sermonId: { [Op.ne]: null } });
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
  if (q) {
    const like = db.sequelize.getDialect() === 'postgres' ? Op.iLike : Op.like;
    const term = `%${q.replace(/[%_\\]/g, '')}%`;
    and.push({
      [Op.or]: [{ guestName: { [like]: term } }, { '$attendeeMember.first_name$': { [like]: term } }, { '$attendeeMember.last_name$': { [like]: term } }]
    } as WhereOptions);
  }
  return and.length ? { [Op.and]: and } : undefined;
}

export const createAttendance = controller.create;
export const getAllAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json(await service.list(paginationSchema.parse(req.query), attendanceWhere(req.query)));
  } catch (error) {
    next(error);
  }
};
export const getAttendanceById = controller.getById;
export const updateAttendance = controller.update;
export const deleteAttendance = controller.remove;
