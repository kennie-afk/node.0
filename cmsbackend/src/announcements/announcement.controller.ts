import { Request, Response } from 'express';
import * as announcementService from './announcement.service';

export const createAnnouncement = async (req: Request, res: Response): Promise<Response> => {
  try {
    const announcementData = req.body;
    const newAnnouncement = await announcementService.createAnnouncement(announcementData);
    return res.status(201).json(newAnnouncement);
  } catch (error: any) {
    console.error('Error in createAnnouncement controller:', error.message);
    if (error.message.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to create announcement record.' });
  }
};

export const getAllAnnouncements = async (req: Request, res: Response): Promise<Response> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const filters: any = {};
    if (req.query.title) filters.title = req.query.title as string;
    if (req.query.content) filters.content = req.query.content as string;
    if (req.query.isPublished !== undefined) filters.isPublished = req.query.isPublished === 'true';
    if (req.query.targetAudience) filters.targetAudience = req.query.targetAudience as 'All' | 'Members' | 'Leaders' | 'Specific Group';
    if (req.query.publicationDateStart) filters.publicationDateStart = req.query.publicationDateStart as string;
    if (req.query.publicationDateEnd) filters.publicationDateEnd = req.query.publicationDateEnd as string;
    if (req.query.expiryDateStart) filters.expiryDateStart = req.query.expiryDateStart as string;
    if (req.query.expiryDateEnd) filters.expiryDateEnd = req.query.expiryDateEnd as string;

    const { announcements, totalCount } = await announcementService.getAllAnnouncements(filters, limit, offset);
    
    return res.status(200).json({
      data: announcements,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    console.error('Error in getAllAnnouncements controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve announcements.' });
  }
};

export const getAnnouncementById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const announcement = await announcementService.getAnnouncementById(Number(id));

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found.' });
    }

    return res.status(200).json(announcement);
  } catch (error: any) {
    console.error('Error in getAnnouncementById controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve announcement.' });
  }
};

export const updateAnnouncement = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const announcementData = req.body;

    const updatedAnnouncement = await announcementService.updateAnnouncement(Number(id), announcementData);

    if (!updatedAnnouncement) {
      return res.status(404).json({ message: 'Announcement not found or no changes made.' });
    }

    return res.status(200).json(updatedAnnouncement);
  } catch (error: any) {
    console.error('Error in updateAnnouncement controller:', error.message);
    if (error.message.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to update announcement.' });
  }
};

export const deleteAnnouncement = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedRowCount = await announcementService.deleteAnnouncement(Number(id));

    if (deletedRowCount === 0) {
      return res.status(404).json({ message: 'Announcement not found.' });
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error in deleteAnnouncement controller:', error.message);
    return res.status(500).json({ message: 'Failed to delete announcement.' });
  }
};