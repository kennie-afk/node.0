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
const errors_1 = require("../utils/errors");
const createAnnouncement = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            throw new errors_1.BadRequestError('Authentication required. Please log in.');
        }
        const announcementData = {
            ...req.body,
            authorUserId: req.user.id,
        };
        const newAnnouncement = await announcementService.createAnnouncement(announcementData);
        return res.status(201).json(newAnnouncement);
    }
    catch (error) {
        throw error;
    }
};
exports.createAnnouncement = createAnnouncement;
const getAllAnnouncements = async (req, res) => {
    try {
        const announcements = await announcementService.getAllAnnouncements();
        return res.status(200).json(announcements);
    }
    catch (error) {
        throw error;
    }
};
exports.getAllAnnouncements = getAllAnnouncements;
const getAnnouncementById = async (req, res) => {
    try {
        const announcement = await announcementService.getAnnouncementById(Number(req.params.id));
        if (!announcement) {
            throw new errors_1.NotFoundError('Announcement not found.');
        }
        return res.status(200).json(announcement);
    }
    catch (error) {
        throw error;
    }
};
exports.getAnnouncementById = getAnnouncementById;
const updateAnnouncement = async (req, res) => {
    try {
        const updatedAnnouncement = await announcementService.updateAnnouncement(Number(req.params.id), req.body);
        if (!updatedAnnouncement) {
            throw new errors_1.NotFoundError('Announcement not found or no changes made.');
        }
        return res.status(200).json(updatedAnnouncement);
    }
    catch (error) {
        throw error;
    }
};
exports.updateAnnouncement = updateAnnouncement;
const deleteAnnouncement = async (req, res) => {
    try {
        const deletedRowCount = await announcementService.deleteAnnouncement(Number(req.params.id));
        if (deletedRowCount === 0) {
            throw new errors_1.NotFoundError('Announcement not found.');
        }
        return res.status(204).send();
    }
    catch (error) {
        throw error;
    }
};
exports.deleteAnnouncement = deleteAnnouncement;
