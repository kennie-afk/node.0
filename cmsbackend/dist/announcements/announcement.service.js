"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAnnouncement = exports.updateAnnouncement = exports.getAnnouncementById = exports.getAllAnnouncements = exports.createAnnouncement = void 0;
const _models_1 = __importDefault(require("@models"));
const sequelize_1 = require("sequelize");
const AnnouncementDbModel = _models_1.default.Announcement;
const UserDbModel = _models_1.default.User;
const createAnnouncement = async (announcementData) => {
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
    }
    catch (error) {
        throw new Error(`Service error creating announcement: ${error.message}`);
    }
};
exports.createAnnouncement = createAnnouncement;
const getAllAnnouncements = async (filters, limit, offset) => {
    try {
        const where = {};
        if (filters.title) {
            where.title = { [sequelize_1.Op.like]: `%${filters.title}%` };
        }
        if (filters.content) {
            where.content = { [sequelize_1.Op.like]: `%${filters.content}%` };
        }
        if (filters.isPublished !== undefined) {
            where.isPublished = filters.isPublished;
        }
        if (filters.targetAudience) {
            where.targetAudience = filters.targetAudience;
        }
        if (filters.publicationDateStart && filters.publicationDateEnd) {
            where.publicationDate = {
                [sequelize_1.Op.between]: [
                    new Date(filters.publicationDateStart),
                    new Date(filters.publicationDateEnd)
                ]
            };
        }
        else if (filters.publicationDateStart) {
            where.publicationDate = {
                [sequelize_1.Op.gte]: new Date(filters.publicationDateStart)
            };
        }
        else if (filters.publicationDateEnd) {
            where.publicationDate = {
                [sequelize_1.Op.lte]: new Date(filters.publicationDateEnd)
            };
        }
        if (filters.expiryDateStart && filters.expiryDateEnd) {
            where.expiryDate = {
                [sequelize_1.Op.between]: [
                    new Date(filters.expiryDateStart),
                    new Date(filters.expiryDateEnd)
                ]
            };
        }
        else if (filters.expiryDateStart) {
            where.expiryDate = {
                [sequelize_1.Op.gte]: new Date(filters.expiryDateStart)
            };
        }
        else if (filters.expiryDateEnd) {
            where.expiryDate = {
                [sequelize_1.Op.lte]: new Date(filters.expiryDateEnd)
            };
        }
        const { count, rows } = await AnnouncementDbModel.findAndCountAll({
            where,
            limit,
            offset,
            include: [{ model: _models_1.default.User, as: 'author', attributes: ['id', 'username'] }],
            order: [['publicationDate', 'DESC']],
        });
        return { announcements: rows, totalCount: count };
    }
    catch (error) {
        throw new Error(`Service error fetching all announcements: ${error.message}`);
    }
};
exports.getAllAnnouncements = getAllAnnouncements;
const getAnnouncementById = async (id) => {
    try {
        const announcement = await AnnouncementDbModel.findByPk(id, {
            include: [{ model: _models_1.default.User, as: 'author', attributes: ['id', 'username'] }]
        });
        return announcement;
    }
    catch (error) {
        throw new Error(`Service error fetching announcement by ID ${id}: ${error.message}`);
    }
};
exports.getAnnouncementById = getAnnouncementById;
const updateAnnouncement = async (id, announcementData) => {
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
            include: [{ model: _models_1.default.User, as: 'author', attributes: ['id', 'username'] }]
        });
        return updatedAnnouncement;
    }
    catch (error) {
        throw new Error(`Service error updating announcement with ID ${id}: ${error.message}`);
    }
};
exports.updateAnnouncement = updateAnnouncement;
const deleteAnnouncement = async (id) => {
    try {
        const deletedRowCount = await AnnouncementDbModel.destroy({
            where: { id },
        });
        return deletedRowCount;
    }
    catch (error) {
        throw new Error(`Service error deleting announcement with ID ${id}: ${error.message}`);
    }
};
exports.deleteAnnouncement = deleteAnnouncement;
