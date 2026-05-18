import db from '@models';
import { Op } from 'sequelize';

const AttendanceDbModel = db.Attendance;
const MemberDbModel = db.Member;
const EventDbModel = db.Event;
const SermonDbModel = db.Sermon;

interface AttendanceFilters {
  memberId?: number;
  eventId?: number;
  sermonId?: number;
  attendanceDate?: string;
  attendanceType?: 'In-person' | 'Online' | 'Other';
}

export const createAttendance = async (attendanceData: any) => {
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
      if (!member) throw new Error(`Member with ID ${memberId} not found.`);
    }

    if (eventId) {
      const event = await EventDbModel.findByPk(eventId);
      if (!event) throw new Error(`Event with ID ${eventId} not found.`);
    }

    if (sermonId) {
      const sermon = await SermonDbModel.findByPk(sermonId);
      if (!sermon) throw new Error(`Sermon with ID ${sermonId} not found.`);
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
  } catch (error: any) {
    throw error;
  }
};

export const getAllAttendance = async (filters: AttendanceFilters, limit: number, offset: number) => {
  try {
    const where: any = {};
    const include: any[] = [
      { model: MemberDbModel, as: 'attendeeMember', attributes: ['id', 'firstName', 'lastName'] },
      { model: EventDbModel, as: 'attendedEvent', attributes: ['id', 'name', 'startTime'] },
      {
        model: SermonDbModel,
        as: 'attendedSermon',
        attributes: ['id', 'title', 'datePreached'],
        include: [{ model: MemberDbModel, as: 'speaker', attributes: ['id', 'firstName', 'lastName'] }]
      },
    ];

    if (filters.memberId) where.memberId = filters.memberId;
    if (filters.eventId) where.eventId = filters.eventId;
    if (filters.sermonId) where.sermonId = filters.sermonId;
    if (filters.attendanceType) where.attendanceType = filters.attendanceType;
    if (filters.attendanceDate) {
      where.attendanceDate = {
        [Op.gte]: new Date(filters.attendanceDate),
        [Op.lt]: new Date(new Date(filters.attendanceDate).setDate(new Date(filters.attendanceDate).getDate() + 1))
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
  } catch (error: any) {
    throw new Error(`Service error fetching attendance records: ${error.message}`);
  }
};

export const getAttendanceById = async (id: number) => {
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
  } catch (error: any) {
    throw new Error(`Service error fetching attendance by ID: ${error.message}`);
  }
};

export const updateAttendance = async (id: number, attendanceData: any) => {
  try {
    const { memberId, guestName, eventId, sermonId, ...rest } = attendanceData;

    if (memberId !== undefined && memberId !== null) {
      const member = await MemberDbModel.findByPk(memberId);
      if (!member) throw new Error(`Member with ID ${memberId} not found.`);
    }
    if (eventId !== undefined && eventId !== null) {
      const event = await EventDbModel.findByPk(eventId);
      if (!event) throw new Error(`Event with ID ${eventId} not found.`);
    }
    if (sermonId !== undefined && sermonId !== null) {
      const sermon = await SermonDbModel.findByPk(sermonId);
      if (!sermon) throw new Error(`Sermon with ID ${sermonId} not found.`);
    }

    const [updatedRowsCount] = await AttendanceDbModel.update(
      { memberId, guestName, eventId, sermonId, ...rest },
      { where: { id } }
    );

    if (updatedRowsCount === 0) return null;

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
  } catch (error: any) {
    throw new Error(`Service error updating attendance: ${error.message}`);
  }
};

export const deleteAttendance = async (id: number) => {
  try {
    return await AttendanceDbModel.destroy({ where: { id } });
  } catch (error: any) {
    throw new Error(`Service error deleting attendance: ${error.message}`);
  }
};