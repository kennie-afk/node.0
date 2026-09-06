import db from '@models';
import { Contribution } from './contribution.model';
import { createCrudService } from '../common/crud-service';

const service = createCrudService<Contribution>(db.Contribution, 'Contribution', {
  include: [
    {
      model: db.Member,
      as: 'member',
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
    }
  ],
  order: [['date', 'DESC'], ['id', 'ASC']]
});

export const repository = service.repository;

export const createContribution = service.create;
export const getAllContributions = service.list;
export const getContributionById = service.findById;
export const updateContribution = service.update;
export const deleteContribution = service.remove;

export default service;
