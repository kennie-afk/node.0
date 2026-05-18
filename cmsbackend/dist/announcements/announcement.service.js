"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAnnouncement = exports.updateAnnouncement = exports.getAnnouncementById = exports.getAllAnnouncements = exports.createAnnouncement = void 0;
const _models_1 = __importDefault(require("@models"));
const AnnouncementDbModel = _models_1.default.Announcement;
const createAnnouncement = async (announcementData) => {
    try {
        const newAnnouncement = await AnnouncementDbModel.create(announcementData);
        return newAnnouncement;
    }
    catch (error) {
        throw new Error(`Service error creating announcement: ${error.message}`);
    }
};
exports.createAnnouncement = createAnnouncement;
const getAllAnnouncements = async () => {
    try {
        const announcements = await AnnouncementDbModel.findAll({
            include: [
                {
                    model: _models_1.default.User,
                    as: 'author',
                    attributes: ['username']
                }
            ],
            order: [['publicationDate', 'DESC']]
        });
        return announcements;
    }
    catch (error) {
        throw new Error(`Service error fetching all announcements: ${error.message}`);
    }
};
exports.getAllAnnouncements = getAllAnnouncements;
const getAnnouncementById = async (id) => {
    try {
        const announcement = await AnnouncementDbModel.findByPk(id, {
            include: [
                {
                    model: _models_1.default.User,
                    as: 'author',
                    attributes: ['username']
                }
            ]
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
        const [updatedRowsCount] = await AnnouncementDbModel.update(announcementData, {
            where: { id },
            returning: true,
        });
        if (updatedRowsCount === 0) {
            return null;
        }
        const updatedAnnouncement = await AnnouncementDbModel.findByPk(id);
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
