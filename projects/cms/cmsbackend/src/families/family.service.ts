import db from '@models';
import { Family } from './family.model';
import { createCrudService } from '../common/crud-service';

const service = createCrudService<Family>(db.Family, 'Family', {
  include: [{ model: db.Member, as: 'headOfFamily', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] }],
  order: [['familyName', 'ASC'], ['id', 'ASC']]
});

export const repository = service.repository;

export const createFamily = service.create;
export const getAllFamilies = service.list;
export const getFamilyById = service.findById;
export const updateFamily = service.update;
export const deleteFamily = service.remove;

export default service;
