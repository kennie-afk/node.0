import { Request, Response } from 'express';
import * as announcementService from './announcement.service';
import { NotFoundError, BadRequestError } from '../utils/errors';

export const createAnnouncement = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user || !req.user.id) {
      throw new BadRequestError('Authentication required. Please log in.');
    }

    const announcementData = {
      ...req.body,
      authorUserId: req.user.id,   
    };

    const newAnnouncement = await announcementService.createAnnouncement(announcementData);
    return res.status(201).json(newAnnouncement);
  } catch (error: any) {
    throw error;
  }
};

export const getAllAnnouncements = async (req: Request, res: Response): Promise<Response> => {
  try {
    const announcements = await announcementService.getAllAnnouncements();
    return res.status(200).json(announcements);
  } catch (error: any) {
    throw error;
  }
};

export const getAnnouncementById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const announcement = await announcementService.getAnnouncementById(Number(req.params.id));
    if (!announcement) {
      throw new NotFoundError('Announcement not found.');
    }
    return res.status(200).json(announcement);
  } catch (error: any) {
    throw error;
  }
};

export const updateAnnouncement = async (req: Request, res: Response): Promise<Response> => {
  try {
    const updatedAnnouncement = await announcementService.updateAnnouncement(Number(req.params.id), req.body);
    if (!updatedAnnouncement) {
      throw new NotFoundError('Announcement not found or no changes made.');
    }
    return res.status(200).json(updatedAnnouncement);
  } catch (error: any) {
    throw error;
  }
};

export const deleteAnnouncement = async (req: Request, res: Response): Promise<Response> => {
  try {
    const deletedRowCount = await announcementService.deleteAnnouncement(Number(req.params.id));
    if (deletedRowCount === 0) {
      throw new NotFoundError('Announcement not found.');
    }
    return res.status(204).send();
  } catch (error: any) {
    throw error;
  }
};