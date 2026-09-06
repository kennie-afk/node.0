import db from '@models';
import { Attendance } from './attendance.model';
import { createCrudService } from '../common/crud-service';

const service = createCrudService<Attendance>(db.Attendance, 'Attendance', {
  include: [
    { model: db.Member, as: 'attendeeMember', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
    { model: db.Event, as: 'attendedEvent', attributes: ['id', 'name', 'startTime'] },
    { model: db.Sermon, as: 'attendedSermon', attributes: ['id', 'title', 'datePreached'] }
  ],
  order: [['attendanceDate', 'DESC'], ['id', 'ASC']]
});

export const repository = service.repository;

export const createAttendance = service.create;
export const getAllAttendance = service.list;
export const getAttendanceById = service.findById;
export const updateAttendance = service.update;
export const deleteAttendance = service.remove;

export default service;
