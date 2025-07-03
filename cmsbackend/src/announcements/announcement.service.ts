import db from '@models';
import { Announcement } from './announcement.model';
import { User } from '../users/user.model';
import { Op } from 'sequelize';

const AnnouncementDbModel = db.Announcement;
const UserDbModel = db.User;

interface AnnouncementFilters {
  title?: string;
  content?: string;
  isPublished?: boolean;
  targetAudience?: 'All' | 'Members' | 'Leaders' | 'Specific Group';
  publicationDateStart?: string;
  publicationDateEnd?: string;
  expiryDateStart?: string;
  expiryDateEnd?: string;
  limit?: number;
  offset?: number;
}

export const createAnnouncement = async (announcementData: {
  title: string;
  content: string;
  authorUserId: number;
  publicationDate?: Date;
  expiryDate?: Date;
  isPublished?: boolean;
  targetAudience?: 'All' | 'Members' | 'Leaders' | 'Specific Group';

}): Promise<InstanceType<typeof Announcement>> => {
  try {
    const { title, content, authorUserId, ...rest } = announcementData;

    if (!title || !content || !authorUserId) {
      throw new Error('Title, content, and author user ID are required for an announcement.');
    }

    const userExists = await UserDbModel.findByPk(authorUserId);
    if (!userExists) {
      throw new Error(`Author User with ID ${authorUserId} not found.`);
    }

    const newAnnouncement = await AnnouncementDbModel.create({
      title,
      content,
      authorUserId,
      ...rest,
      publicationDate: rest.publicationDate,
    });

    return newAnnouncement;
  } catch (error: any) {
    throw new Error(`Service error creating announcement: ${error.message}`);
  }
};

export const getAllAnnouncements = async (
  filters: AnnouncementFilters
): Promise<Array<InstanceType<typeof Announcement>>> => {
  try {
    const where: any = {};

    if (filters.title) {
      where.title = { [Op.like]: `%${filters.title}%` };
    }
    if (filters.content) {
      where.content = { [Op.like]: `%${filters.content}%` };
    }
    if (filters.isPublished !== undefined) {
      where.isPublished = filters.isPublished;
    }
    if (filters.targetAudience) {
      where.targetAudience = filters.targetAudience;
    }

    if (filters.publicationDateStart && filters.publicationDateEnd) {
      where.publicationDate = {
        [Op.between]: [
          new Date(filters.publicationDateStart),
          new Date(filters.publicationDateEnd)
        ]
      };
    } else if (filters.publicationDateStart) {
      where.publicationDate = {
        [Op.gte]: new Date(filters.publicationDateStart)
      };
    } else if (filters.publicationDateEnd) {
      where.publicationDate = {
        [Op.lte]: new Date(filters.publicationDateEnd)
      };
    }

    if (filters.expiryDateStart && filters.expiryDateEnd) {
      where.expiryDate = {
        [Op.between]: [
          new Date(filters.expiryDateStart),
          new Date(filters.expiryDateEnd)
        ]
      };
    } else if (filters.expiryDateStart) {
      where.expiryDate = {
        [Op.gte]: new Date(filters.expiryDateStart)
      };
    } else if (filters.expiryDateEnd) {
      where.expiryDate = {
        [Op.lte]: new Date(filters.expiryDateEnd)
      };
    }

    const announcements = await AnnouncementDbModel.findAll({
      where,
      limit: filters.limit ? Number(filters.limit) : undefined,
      offset: filters.offset ? Number(filters.offset) : undefined,
      include: [{ model: db.User, as: 'author', attributes: ['id', 'username'] }],
      order: [['publicationDate', 'DESC']],
    });
    return announcements;
  } catch (error: any) {
    throw new Error(`Service error fetching all announcements: ${error.message}`);
  }
};

export const getAnnouncementById = async (id: number): Promise<InstanceType<typeof Announcement> | null> => {
  try {
    const announcement = await AnnouncementDbModel.findByPk(id, {
      include: [{ model: db.User, as: 'author', attributes: ['id', 'username'] }]
    });
    return announcement;
  } catch (error: any) {
    throw new Error(`Service error fetching announcement by ID ${id}: ${error.message}`);
  }
};

export const updateAnnouncement = async (id: number, announcementData: {
  title?: string;
  content?: string;
  authorUserId?: number;
  publicationDate?: Date;
  expiryDate?: Date;
  isPublished?: boolean;
  targetAudience?: 'All' | 'Members' | 'Leaders' | 'Specific Group';
}): Promise<InstanceType<typeof Announcement> | null> => {
  try {
    const { authorUserId, ...rest } = announcementData;

    if (authorUserId !== undefined && authorUserId !== null) {
      const userExists = await UserDbModel.findByPk(authorUserId);
      if (!userExists) {
        throw new Error(`Author User with ID ${authorUserId} not found for update.`);
      }
    }

    const [updatedRowsCount] = await AnnouncementDbModel.update({ authorUserId, ...rest }, {
      where: { id },
    });

    if (updatedRowsCount === 0) {
      return null;
    }

    const updatedAnnouncement = await AnnouncementDbModel.findByPk(id, {
      include: [{ model: db.User, as: 'author', attributes: ['id', 'username'] }]
    });
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