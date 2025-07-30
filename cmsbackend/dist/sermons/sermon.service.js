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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSermon = exports.updateSermon = exports.getSermonById = exports.getAllSermons = exports.createSermon = void 0;
const _models_1 = __importDefault(require("@models"));
const eventService = __importStar(require("@events/event.service"));
const SermonDbModel = _models_1.default.Sermon;
const MemberDbModel = _models_1.default.Member;
const EventDbModel = _models_1.default.Event;
const createSermon = async (sermonData) => {
    try {
        const { title, datePreached, speakerMemberId, ...rest } = sermonData;
        if (!title || !datePreached) {
            throw new Error('Sermon title and date preached are required.');
        }
        let speakerName = 'Unknown Speaker';
        if (speakerMemberId) {
            const memberExists = await MemberDbModel.findByPk(speakerMemberId);
            if (!memberExists) {
                throw new Error(`Speaker Member with ID ${speakerMemberId} not found.`);
            }
            speakerName = `${memberExists.firstName} ${memberExists.lastName}`;
        }
        let createdEvent;
        try {
            const eventName = `Sermon: ${title}`;
            const eventDescription = `Sermon delivered by ${speakerName} on ${new Date(datePreached).toDateString()}.`;
            const eventStartTime = new Date(datePreached);
            eventStartTime.setHours(10, 0, 0, 0);
            createdEvent = await eventService.createEvent({
                name: eventName,
                description: eventDescription,
                type: 'Service',
                startTime: eventStartTime,
                location: 'Main Auditorium',
                organizerUserId: 1,
                isRecurring: false,
            });
            console.log(`Automatic event created for sermon "${title}" with ID: ${createdEvent.id}`);
        }
        catch (eventCreationError) {
            console.error('Error creating automatic event for sermon:', title, eventCreationError.message);
            createdEvent = null;
        }
        const newSermon = await SermonDbModel.create({
            title,
            datePreached,
            speakerMemberId,
            eventId: createdEvent ? createdEvent.id : null,
            ...rest,
        });
        return newSermon;
    }
    catch (error) {
        throw new Error(`Service error creating sermon: ${error.message}`);
    }
};
exports.createSermon = createSermon;
const getAllSermons = async (limit, offset) => {
    try {
        const { count, rows } = await SermonDbModel.findAndCountAll({
            limit,
            offset,
            include: [
                { model: _models_1.default.Member, as: 'speaker' },
                { model: _models_1.default.Event, as: 'event' }
            ],
            order: [['datePreached', 'DESC']],
        });
        return { sermons: rows, totalCount: count };
    }
    catch (error) {
        throw new Error(`Service error fetching all sermons: ${error.message}`);
    }
};
exports.getAllSermons = getAllSermons;
const getSermonById = async (id) => {
    try {
        const sermon = await SermonDbModel.findByPk(id, {
            include: [
                { model: _models_1.default.Member, as: 'speaker' },
                { model: _models_1.default.Event, as: 'event' }
            ]
        });
        return sermon;
    }
    catch (error) {
        throw new Error(`Service error fetching sermon by ID ${id}: ${error.message}`);
    }
};
exports.getSermonById = getSermonById;
const updateSermon = async (id, sermonData) => {
    try {
        const { speakerMemberId, eventId, ...rest } = sermonData;
        if (speakerMemberId !== undefined && speakerMemberId !== null) {
            const memberExists = await MemberDbModel.findByPk(speakerMemberId);
            if (!memberExists) {
                throw new Error(`Speaker Member with ID ${speakerMemberId} not found for update.`);
            }
        }
        if (eventId !== undefined && eventId !== null) {
            const eventExists = await EventDbModel.findByPk(eventId);
            if (!eventExists) {
                throw new Error(`Event with ID ${eventId} not found for update.`);
            }
        }
        const [updatedRowsCount] = await SermonDbModel.update({ speakerMemberId, eventId, ...rest }, {
            where: { id },
        });
        if (updatedRowsCount === 0) {
            return null;
        }
        const updatedSermon = await SermonDbModel.findByPk(id, {
            include: [
                { model: _models_1.default.Member, as: 'speaker' },
                { model: _models_1.default.Event, as: 'event' }
            ]
        });
        return updatedSermon;
    }
    catch (error) {
        throw new Error(`Service error updating sermon with ID ${id}: ${error.message}`);
    }
};
exports.updateSermon = updateSermon;
const deleteSermon = async (id) => {
    try {
        const deletedRowCount = await SermonDbModel.destroy({
            where: { id },
        });
        return deletedRowCount;
    }
    catch (error) {
        throw new Error(`Service error deleting sermon with ID ${id}: ${error.message}`);
    }
};
exports.deleteSermon = deleteSermon;
