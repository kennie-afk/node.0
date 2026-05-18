"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEvent = exports.updateEvent = exports.getEventById = exports.getAllEvents = exports.createEvent = void 0;
const _models_1 = __importDefault(require("@models"));
const EventDbModel = _models_1.default.Event;
const createEvent = async (eventData) => {
    try {
        const newEvent = await EventDbModel.create(eventData);
        return newEvent;
    }
    catch (error) {
        throw new Error(`Service error creating event: ${error.message}`);
    }
};
exports.createEvent = createEvent;
const getAllEvents = async () => {
    try {
        const events = await EventDbModel.findAll();
        return events;
    }
    catch (error) {
        throw new Error(`Service error fetching all events: ${error.message}`);
    }
};
exports.getAllEvents = getAllEvents;
const getEventById = async (id) => {
    try {
        const event = await EventDbModel.findByPk(id);
        return event;
    }
    catch (error) {
        throw new Error(`Service error fetching event by ID ${id}: ${error.message}`);
    }
};
exports.getEventById = getEventById;
const updateEvent = async (id, eventData) => {
    try {
        const [updatedRowsCount] = await EventDbModel.update(eventData, {
            where: { id },
            returning: true,
        });
        if (updatedRowsCount === 0) {
            return null;
        }
        const updatedEvent = await EventDbModel.findByPk(id);
        return updatedEvent;
    }
    catch (error) {
        throw new Error(`Service error updating event with ID ${id}: ${error.message}`);
    }
};
exports.updateEvent = updateEvent;
const deleteEvent = async (id) => {
    try {
        const deletedRowCount = await EventDbModel.destroy({
            where: { id },
        });
        return deletedRowCount;
    }
    catch (error) {
        throw new Error(`Service error deleting event with ID ${id}: ${error.message}`);
    }
};
exports.deleteEvent = deleteEvent;
