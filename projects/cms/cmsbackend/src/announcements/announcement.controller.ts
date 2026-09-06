import { NextFunction, Request, Response } from 'express';
import { createCrudController } from '../common/crud-controller';
import { UnauthorizedError } from '../utils/errors';
import service from './announcement.service';

const controller = createCrudController(service, 'Announcement');

export const createAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authorUserId = req.user?.id;
    if (typeof authorUserId !== 'number') {
      throw new UnauthorizedError('An announcement must be attributed to a signed in user.');
    }
    res.status(201).json(await service.create({ ...req.body, authorUserId }));
  } catch (error) {
    next(error);
  }
};

export const getAllAnnouncements = controller.list;
export const getAnnouncementById = controller.getById;
export const updateAnnouncement = controller.update;
export const deleteAnnouncement = controller.remove;
