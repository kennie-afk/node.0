import db from '@models';
import { Attendance } from './attendance.model';
import { createCrudService } from '../common/crud-service';

const service = createCrudService<Attendance>(db.Attendance, 'Attendance', {
  order: [['date', 'DESC'], ['id', 'ASC']]
});

export const repository = service.repository;

export const createAttendance = service.create;
export const getAllAttendance = service.list;
export const getAttendanceById = service.findById;
export const updateAttendance = service.update;
export const deleteAttendance = service.remove;

export default service;
