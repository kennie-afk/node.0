import { createCrudController } from '../common/crud-controller';
import service from './event.service';

const controller = createCrudController(service, 'Event');

export const createEvent = controller.create;
export const getAllEvents = controller.list;
export const getEventById = controller.getById;
export const updateEvent = controller.update;
export const deleteEvent = controller.remove;
