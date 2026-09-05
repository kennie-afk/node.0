import { createCrudController } from '../common/crud-controller';
import service from './sermon.service';

const controller = createCrudController(service, 'Sermon');

export const createSermon = controller.create;
export const getAllSermons = controller.list;
export const getSermonById = controller.getById;
export const updateSermon = controller.update;
export const deleteSermon = controller.remove;
