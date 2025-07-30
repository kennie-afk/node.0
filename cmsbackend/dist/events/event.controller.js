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
exports.deleteEvent = exports.updateEvent = exports.getEventById = exports.getAllEvents = exports.createEvent = void 0;
const eventService = __importStar(require("./event.service"));
const createEvent = async (req, res) => {
    try {
        const newEvent = await eventService.createEvent(req.body);
        return res.status(201).json(newEvent);
    }
    catch (error) {
        console.error('Error in createEvent controller:', error.message);
        if (error.message.includes('required.')) {
            return res.status(400).json({ message: error.message });
        }
        if (error.message.includes('not found.')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to create event.' });
    }
};
exports.createEvent = createEvent;
const getAllEvents = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const { events, totalCount } = await eventService.getAllEvents(limit, offset);
        return res.status(200).json({
            data: events,
            meta: {
                totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
            },
        });
    }
    catch (error) {
        console.error('Error in getAllEvents controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve events.' });
    }
};
exports.getAllEvents = getAllEvents;
const getEventById = async (req, res) => {
    try {
        const { id } = req.params;
        const event = await eventService.getEventById(Number(id));
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        return res.status(200).json(event);
    }
    catch (error) {
        console.error('Error in getEventById controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve event.' });
    }
};
exports.getEventById = getEventById;
const updateEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedEvent = await eventService.updateEvent(Number(id), req.body);
        if (!updatedEvent) {
            return res.status(404).json({ message: 'Event not found or no changes made.' });
        }
        return res.status(200).json(updatedEvent);
    }
    catch (error) {
        console.error('Error in updateEvent controller:', error.message);
        if (error.message.includes('not found for update.')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to update event.' });
    }
};
exports.updateEvent = updateEvent;
const deleteEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRowCount = await eventService.deleteEvent(Number(id));
        if (deletedRowCount === 0) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        return res.status(204).send();
    }
    catch (error) {
        console.error('Error in deleteEvent controller:', error.message);
        return res.status(500).json({ message: 'Failed to delete event.' });
    }
};
exports.deleteEvent = deleteEvent;
