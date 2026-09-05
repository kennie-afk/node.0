import { createCrudController } from '../common/crud-controller';
import service from './announcement.service';

const controller = createCrudController(service, 'Announcement');

export const createAnnouncement = controller.create;
export const getAllAnnouncements = controller.list;
export const getAnnouncementById = controller.getById;
export const updateAnnouncement = controller.update;
export const deleteAnnouncement = controller.remove;
