import { createCrudController } from '../common/crud-controller';
import service from './family.service';

const controller = createCrudController(service, 'Family', { searchColumns: ['familyName','city','county'] });

export const createFamily = controller.create;
export const getAllFamilies = controller.list;
export const getFamilyById = controller.getById;
export const updateFamily = controller.update;
export const deleteFamily = controller.remove;
