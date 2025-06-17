import { Request, Response } from 'express';
import * as announcementService from './announcement.service';

export const createAnnouncement = async (req: Request, res: Response): Promise<Response> => {
  try {
    const newAnnouncement = await announcementService.createAnnouncement(req.body);
    return res.status(201).json(newAnnouncement);
  } catch (error: any) {
    console.error('Error in createAnnouncement controller:', error.message);
    if (error.message.includes('required.')) {
      return res.status(400).json({ message: error.message });
    }
    if (error.message.includes('not found.')) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to create announcement.' });
  }
};

export const getAllAnnouncements = async (req: Request, res: Response): Promise<Response> => {
  try {
    const announcements = await announcementService.getAllAnnouncements();
    return res.status(200).json(announcements);
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
    const updatedAnnouncement = await announcementService.updateAnnouncement(Number(id), req.body);
    if (!updatedAnnouncement) {
      return res.status(404).json({ message: 'Announcement not found or no changes made.' });
    }
    return res.status(200).json(updatedAnnouncement);
  } catch (error: any) {
    console.error('Error in updateAnnouncement controller:', error.message);
    if (error.message.includes('not found for update.')) {
      return res.status(400).json({ message: error.message });
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