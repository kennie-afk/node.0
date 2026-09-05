import { createCrudController } from '../common/crud-controller';
import service from './attendance.service';

const controller = createCrudController(service, 'Attendance');

export const createAttendance = controller.create;
export const getAllAttendance = controller.list;
export const getAttendanceById = controller.getById;
export const updateAttendance = controller.update;
export const deleteAttendance = controller.remove;
