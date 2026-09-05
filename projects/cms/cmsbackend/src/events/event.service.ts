import db from '@models';
import { Event } from './event.model';
import { createCrudService } from '../common/crud-service';

const service = createCrudService<Event>(db.Event, 'Event', {
  order: [['startTime', 'DESC'], ['id', 'ASC']]
});

export const repository = service.repository;

export const createEvent = service.create;
export const getAllEvents = service.list;
export const getEventById = service.findById;
export const updateEvent = service.update;
export const deleteEvent = service.remove;

export default service;
