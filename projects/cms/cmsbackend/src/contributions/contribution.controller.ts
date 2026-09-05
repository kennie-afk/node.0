import { createCrudController } from '../common/crud-controller';
import service from './contribution.service';

const controller = createCrudController(service, 'Contribution');

export const createContribution = controller.create;
export const getAllContributions = controller.list;
export const getContributionById = controller.getById;
export const updateContribution = controller.update;
export const deleteContribution = controller.remove;
