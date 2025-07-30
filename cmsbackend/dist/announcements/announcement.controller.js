"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAnnouncement = exports.updateAnnouncement = exports.getAnnouncementById = exports.getAllAnnouncements = exports.createAnnouncement = void 0;
const announcementService = __importStar(require("./announcement.service"));
const createAnnouncement = async (req, res) => {
    try {
        const announcementData = req.body;
        const newAnnouncement = await announcementService.createAnnouncement(announcementData);
        return res.status(201).json(newAnnouncement);
    }
    catch (error) {
        console.error('Error in createAnnouncement controller:', error.message);
        if (error.message.includes('not found')) {
            return res.status(404).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to create announcement record.' });
    }
};
exports.createAnnouncement = createAnnouncement;
const getAllAnnouncements = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const filters = {};
        if (req.query.title)
            filters.title = req.query.title;
        if (req.query.content)
            filters.content = req.query.content;
        if (req.query.isPublished !== undefined)
            filters.isPublished = req.query.isPublished === 'true';
        if (req.query.targetAudience)
            filters.targetAudience = req.query.targetAudience;
        if (req.query.publicationDateStart)
            filters.publicationDateStart = req.query.publicationDateStart;
        if (req.query.publicationDateEnd)
            filters.publicationDateEnd = req.query.publicationDateEnd;
        if (req.query.expiryDateStart)
            filters.expiryDateStart = req.query.expiryDateStart;
        if (req.query.expiryDateEnd)
            filters.expiryDateEnd = req.query.expiryDateEnd;
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
    }
    catch (error) {
        console.error('Error in getAllAnnouncements controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve announcements.' });
    }
};
exports.getAllAnnouncements = getAllAnnouncements;
const getAnnouncementById = async (req, res) => {
    try {
        const { id } = req.params;
        const announcement = await announcementService.getAnnouncementById(Number(id));
        if (!announcement) {
            return res.status(404).json({ message: 'Announcement not found.' });
        }
        return res.status(200).json(announcement);
    }
    catch (error) {
        console.error('Error in getAnnouncementById controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve announcement.' });
    }
};
exports.getAnnouncementById = getAnnouncementById;
const updateAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const announcementData = req.body;
        const updatedAnnouncement = await announcementService.updateAnnouncement(Number(id), announcementData);
        if (!updatedAnnouncement) {
            return res.status(404).json({ message: 'Announcement not found or no changes made.' });
        }
        return res.status(200).json(updatedAnnouncement);
    }
    catch (error) {
        console.error('Error in updateAnnouncement controller:', error.message);
        if (error.message.includes('not found')) {
            return res.status(404).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to update announcement.' });
    }
};
exports.updateAnnouncement = updateAnnouncement;
const deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRowCount = await announcementService.deleteAnnouncement(Number(id));
        if (deletedRowCount === 0) {
            return res.status(404).json({ message: 'Announcement not found.' });
        }
        return res.status(204).send();
    }
    catch (error) {
        console.error('Error in deleteAnnouncement controller:', error.message);
        return res.status(500).json({ message: 'Failed to delete announcement.' });
    }
};
exports.deleteAnnouncement = deleteAnnouncement;
