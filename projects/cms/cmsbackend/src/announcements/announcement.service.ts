import db from '@models';
import { Announcement } from './announcement.model';
import { createCrudService } from '../common/crud-service';

const service = createCrudService<Announcement>(db.Announcement, 'Announcement', {
  order: [['createdAt', 'DESC'], ['id', 'ASC']]
});

export const repository = service.repository;

export const createAnnouncement = service.create;
export const getAllAnnouncements = service.list;
export const getAnnouncementById = service.findById;
export const updateAnnouncement = service.update;
export const deleteAnnouncement = service.remove;

export default service;
