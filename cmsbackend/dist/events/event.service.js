"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEvent = exports.updateEvent = exports.getEventById = exports.getAllEvents = exports.createEvent = void 0;
const _models_1 = __importDefault(require("@models"));
const EventDbModel = _models_1.default.Event;
const UserDbModel = _models_1.default.User;
const createEvent = async (eventData) => {
    try {
        const { name, startTime, organizerUserId, ...rest } = eventData;
        if (!name || !startTime) {
            throw new Error('Event name and start time are required.');
        }
        if (organizerUserId) {
            const userExists = await UserDbModel.findByPk(organizerUserId);
            if (!userExists) {
                throw new Error(`Organizer User with ID ${organizerUserId} not found.`);
            }
        }
        const newEvent = await EventDbModel.create({
            name, startTime, organizerUserId,
            ...rest
        });
        return newEvent;
    }
    catch (error) {
        throw new Error(`Service error creating event: ${error.message}`);
    }
};
exports.createEvent = createEvent;
const getAllEvents = async (limit, offset) => {
    try {
        const { count, rows } = await EventDbModel.findAndCountAll({
            limit,
            offset,
            include: [{ model: _models_1.default.User, as: 'organizer' }],
            order: [['startTime', 'DESC']],
        });
        return { events: rows, totalCount: count };
    }
    catch (error) {
        throw new Error(`Service error fetching all events: ${error.message}`);
    }
};
exports.getAllEvents = getAllEvents;
const getEventById = async (id) => {
    try {
        const event = await EventDbModel.findByPk(id, {
            include: [{ model: _models_1.default.User, as: 'organizer' }]
        });
        return event;
    }
    catch (error) {
        throw new Error(`Service error fetching event by ID ${id}: ${error.message}`);
    }
};
exports.getEventById = getEventById;
const updateEvent = async (id, eventData) => {
    try {
        const { organizerUserId, ...rest } = eventData;
        if (organizerUserId !== undefined && organizerUserId !== null) {
            const userExists = await UserDbModel.findByPk(organizerUserId);
            if (!userExists) {
                throw new Error(`Organizer User with ID ${organizerUserId} not found for update.`);
            }
        }
        const [updatedRowsCount] = await EventDbModel.update({ organizerUserId, ...rest }, {
            where: { id },
        });
        if (updatedRowsCount === 0) {
            return null;
        }
        const updatedEvent = await EventDbModel.findByPk(id, {
            include: [{ model: _models_1.default.User, as: 'organizer' }]
        });
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
