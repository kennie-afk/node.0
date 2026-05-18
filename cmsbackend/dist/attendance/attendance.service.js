"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAttendance = exports.updateAttendance = exports.getAttendanceById = exports.getAllAttendance = exports.createAttendance = void 0;
const _models_1 = __importDefault(require("@models"));
const sequelize_1 = require("sequelize");
const AttendanceDbModel = _models_1.default.Attendance;
const MemberDbModel = _models_1.default.Member;
const EventDbModel = _models_1.default.Event;
const SermonDbModel = _models_1.default.Sermon;
const createAttendance = async (attendanceData) => {
    try {
        const { memberId, guestName, attendanceDate, eventId, sermonId, attendanceType, notes } = attendanceData;
        if (!attendanceDate || !attendanceType) {
            throw new Error('Attendance date and type are required.');
        }
        if (!memberId && !guestName) {
            throw new Error('Either member ID or guest name must be provided.');
        }
        if (memberId) {
            const member = await MemberDbModel.findByPk(memberId);
            if (!member)
                throw new Error(`Member with ID ${memberId} not found.`);
        }
        if (eventId) {
            const event = await EventDbModel.findByPk(eventId);
            if (!event)
                throw new Error(`Event with ID ${eventId} not found.`);
        }
        if (sermonId) {
            const sermon = await SermonDbModel.findByPk(sermonId);
            if (!sermon)
                throw new Error(`Sermon with ID ${sermonId} not found.`);
        }
        const newAttendance = await AttendanceDbModel.create({
            memberId,
            guestName,
            attendanceDate,
            eventId,
            sermonId,
            attendanceType,
            notes,
        });
        const createdAttendance = await AttendanceDbModel.findByPk(newAttendance.id, {
            include: [
                { model: MemberDbModel, as: 'attendeeMember', attributes: ['id', 'firstName', 'lastName'] },
                { model: EventDbModel, as: 'attendedEvent', attributes: ['id', 'name', 'startTime'] },
                {
                    model: SermonDbModel,
                    as: 'attendedSermon',
                    attributes: ['id', 'title', 'datePreached'],
                    include: [{ model: MemberDbModel, as: 'speaker', attributes: ['id', 'firstName', 'lastName'] }]
                },
            ],
        });
        if (!createdAttendance) {
            throw new Error("Failed to retrieve newly created attendance record.");
        }
        return createdAttendance;
    }
    catch (error) {
        throw error;
    }
};
exports.createAttendance = createAttendance;
const getAllAttendance = async (filters, limit, offset) => {
    try {
        const where = {};
        const include = [
            { model: MemberDbModel, as: 'attendeeMember', attributes: ['id', 'firstName', 'lastName'] },
            { model: EventDbModel, as: 'attendedEvent', attributes: ['id', 'name', 'startTime'] },
            {
                model: SermonDbModel,
                as: 'attendedSermon',
                attributes: ['id', 'title', 'datePreached'],
                include: [{ model: MemberDbModel, as: 'speaker', attributes: ['id', 'firstName', 'lastName'] }]
            },
        ];
        if (filters.memberId)
            where.memberId = filters.memberId;
        if (filters.eventId)
            where.eventId = filters.eventId;
        if (filters.sermonId)
            where.sermonId = filters.sermonId;
        if (filters.attendanceType)
            where.attendanceType = filters.attendanceType;
        if (filters.attendanceDate) {
            where.attendanceDate = {
                [sequelize_1.Op.gte]: new Date(filters.attendanceDate),
                [sequelize_1.Op.lt]: new Date(new Date(filters.attendanceDate).setDate(new Date(filters.attendanceDate).getDate() + 1))
            };
        }
        const { count, rows } = await AttendanceDbModel.findAndCountAll({
            where,
            limit,
            offset,
            order: [['attendanceDate', 'DESC']],
            include,
        });
        return { attendanceRecords: rows, totalCount: count };
    }
    catch (error) {
        throw new Error(`Service error fetching attendance records: ${error.message}`);
    }
};
exports.getAllAttendance = getAllAttendance;
const getAttendanceById = async (id) => {
    try {
        return await AttendanceDbModel.findByPk(id, {
            include: [
                { model: MemberDbModel, as: 'attendeeMember', attributes: ['id', 'firstName', 'lastName'] },
                { model: EventDbModel, as: 'attendedEvent', attributes: ['id', 'name', 'startTime'] },
                {
                    model: SermonDbModel,
                    as: 'attendedSermon',
                    attributes: ['id', 'title', 'datePreached'],
                    include: [{ model: MemberDbModel, as: 'speaker', attributes: ['id', 'firstName', 'lastName'] }]
                },
            ],
        });
    }
    catch (error) {
        throw new Error(`Service error fetching attendance by ID: ${error.message}`);
    }
};
exports.getAttendanceById = getAttendanceById;
const updateAttendance = async (id, attendanceData) => {
    try {
        const { memberId, guestName, eventId, sermonId, ...rest } = attendanceData;
        if (memberId !== undefined && memberId !== null) {
            const member = await MemberDbModel.findByPk(memberId);
            if (!member)
                throw new Error(`Member with ID ${memberId} not found.`);
        }
        if (eventId !== undefined && eventId !== null) {
            const event = await EventDbModel.findByPk(eventId);
            if (!event)
                throw new Error(`Event with ID ${eventId} not found.`);
        }
        if (sermonId !== undefined && sermonId !== null) {
            const sermon = await SermonDbModel.findByPk(sermonId);
            if (!sermon)
                throw new Error(`Sermon with ID ${sermonId} not found.`);
        }
        const [updatedRowsCount] = await AttendanceDbModel.update({ memberId, guestName, eventId, sermonId, ...rest }, { where: { id } });
        if (updatedRowsCount === 0)
            return null;
        return await AttendanceDbModel.findByPk(id, {
            include: [
                { model: MemberDbModel, as: 'attendeeMember', attributes: ['id', 'firstName', 'lastName'] },
                { model: EventDbModel, as: 'attendedEvent', attributes: ['id', 'name', 'startTime'] },
                {
                    model: SermonDbModel,
                    as: 'attendedSermon',
                    attributes: ['id', 'title', 'datePreached'],
                    include: [{ model: MemberDbModel, as: 'speaker', attributes: ['id', 'firstName', 'lastName'] }]
                },
            ],
        });
    }
    catch (error) {
        throw new Error(`Service error updating attendance: ${error.message}`);
    }
};
exports.updateAttendance = updateAttendance;
const deleteAttendance = async (id) => {
    try {
        return await AttendanceDbModel.destroy({ where: { id } });
    }
    catch (error) {
        throw new Error(`Service error deleting attendance: ${error.message}`);
    }
};
exports.deleteAttendance = deleteAttendance;
