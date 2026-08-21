import db from '@models';
import { Announcement } from './announcement.model';

const AnnouncementDbModel = db.Announcement;

export const createAnnouncement = async (announcementData: Partial<Announcement>): Promise<Announcement> => {
  try {
    const newAnnouncement = await AnnouncementDbModel.create(announcementData);
    return newAnnouncement;
  } catch (error: any) {
    throw new Error(`Service error creating announcement: ${error.message}`);
  }
};

export const getAllAnnouncements = async (): Promise<Announcement[]> => {
  try {
    const announcements = await AnnouncementDbModel.findAll({
      include: [
        {
          model: db.User,
          as: 'author',
          attributes: ['username']   
        }
      ],
      order: [['publicationDate', 'DESC']]
    });
    return announcements;
  } catch (error: any) {
    throw new Error(`Service error fetching all announcements: ${error.message}`);
  }
};

export const getAnnouncementById = async (id: number): Promise<Announcement | null> => {
  try {
    const announcement = await AnnouncementDbModel.findByPk(id, {
      include: [
        {
          model: db.User,
          as: 'author',
          attributes: ['username']
        }
      ]
    });
    return announcement;
  } catch (error: any) {
    throw new Error(`Service error fetching announcement by ID ${id}: ${error.message}`);
  }
};

export const updateAnnouncement = async (id: number, announcementData: Partial<Announcement>): Promise<Announcement | null> => {
  try {
    const [updatedRowsCount] = await AnnouncementDbModel.update(announcementData, {
      where: { id },
      returning: true,
    });
    if (updatedRowsCount === 0) {
      return null;
    }
    const updatedAnnouncement = await AnnouncementDbModel.findByPk(id);
    return updatedAnnouncement;
  } catch (error: any) {
    throw new Error(`Service error updating announcement with ID ${id}: ${error.message}`);
  }
};

export const deleteAnnouncement = async (id: number): Promise<number> => {
  try {
    const deletedRowCount = await AnnouncementDbModel.destroy({
      where: { id },
    });
    return deletedRowCount;
  } catch (error: any) {
    throw new Error(`Service error deleting announcement with ID ${id}: ${error.message}`);
  }
};