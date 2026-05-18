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
const errors_1 = require("../utils/errors");
const createEvent = async (req, res) => {
    try {
        const newEvent = await eventService.createEvent(req.body);
        return res.status(201).json(newEvent);
    }
    catch (error) {
        throw error;
    }
};
exports.createEvent = createEvent;
const getAllEvents = async (req, res) => {
    try {
        const events = await eventService.getAllEvents();
        return res.status(200).json(events);
    }
    catch (error) {
        throw error;
    }
};
exports.getAllEvents = getAllEvents;
const getEventById = async (req, res) => {
    try {
        const event = await eventService.getEventById(Number(req.params.id));
        if (!event) {
            throw new errors_1.NotFoundError('Event not found.');
        }
        return res.status(200).json(event);
    }
    catch (error) {
        throw error;
    }
};
exports.getEventById = getEventById;
const updateEvent = async (req, res) => {
    try {
        const updatedEvent = await eventService.updateEvent(Number(req.params.id), req.body);
        if (!updatedEvent) {
            throw new errors_1.NotFoundError('Event not found or no changes made.');
        }
        return res.status(200).json(updatedEvent);
    }
    catch (error) {
        throw error;
    }
};
exports.updateEvent = updateEvent;
const deleteEvent = async (req, res) => {
    try {
        const deletedRowCount = await eventService.deleteEvent(Number(req.params.id));
        if (deletedRowCount === 0) {
            throw new errors_1.NotFoundError('Event not found.');
        }
        return res.status(204).send();
    }
    catch (error) {
        throw error;
    }
};
exports.deleteEvent = deleteEvent;
