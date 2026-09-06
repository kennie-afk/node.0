import db from '@models';
import { Sermon } from './sermon.model';
import { createCrudService } from '../common/crud-service';

const service = createCrudService<Sermon>(db.Sermon, 'Sermon', {
  include: [
    { model: db.Member, as: 'speaker', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
    { model: db.Event, as: 'event', attributes: ['id', 'name', 'startTime'] }
  ],
  order: [['datePreached', 'DESC'], ['id', 'ASC']]
});

export const repository = service.repository;

export const createSermon = service.create;
export const getAllSermons = service.list;
export const getSermonById = service.findById;
export const updateSermon = service.update;
export const deleteSermon = service.remove;

export default service;
