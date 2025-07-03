import db from '@models';
import { Attendance } from './attendance.model';
import { Member } from '../members/member.model';
import { User } from '../users/user.model';
import { Event } from '../events/event.model';
import { Sermon } from '../sermons/sermon.model';
import { Op } from 'sequelize';

const AttendanceDbModel = db.Attendance;
const MemberDbModel = db.Member;
const UserDbModel = db.User;
const EventDbModel = db.Event;
const SermonDbModel = db.Sermon;

interface AttendanceFilters {
  memberId?: number;
  eventId?: number;
  sermonId?: number;
  attendanceDate?: string;
  attendanceType?: 'In-person' | 'Online' | 'Other';
  limit?: number;
  offset?: number;
}

export const createAttendance = async (attendanceData: {
  memberId?: number | null;
  guestName?: string | null;
  attendanceDate: Date;
  eventId?: number | null;
  sermonId?: number | null;
  attendanceType: 'In-person' | 'Online' | 'Other';
  notes?: string | null;
}): Promise<InstanceType<typeof Attendance>> => {
  try {
    const { memberId, guestName, attendanceDate, eventId, sermonId, attendanceType, notes } = attendanceData;

    if (!attendanceDate || !attendanceType) {
      throw new Error('Attendance date and type are required.');
    }

    if (!memberId && !guestName) {
      throw new Error('Either member ID or guest name must be provided for an attendance record.');
    }

    if (memberId) {
      const member = await MemberDbModel.findByPk(memberId);
      if (!member) {
        throw new Error(`Member with ID ${memberId} not found.`);
      }
    }

    if (eventId) {
      const event = await EventDbModel.findByPk(eventId);
      if (!event) {
        throw new Error(`Event with ID ${eventId} not found.`);
      }
    }

    if (sermonId) {
      const sermon = await SermonDbModel.findByPk(sermonId);
      if (!sermon) {
        throw new Error(`Sermon with ID ${sermonId} not found.`);
      }
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
        { model: MemberDbModel, as: 'attendeeMember', attributes: ['id', 'firstName', 'lastName'], required: false },
        { model: EventDbModel, as: 'attendedEvent', attributes: ['id', 'name', 'startTime'], required: false },
        {
          model: SermonDbModel,
          as: 'attendedSermon',
          attributes: ['id', 'title', 'datePreached'],
          required: false,
          include: [
            { model: MemberDbModel, as: 'speaker', attributes: ['id', 'firstName', 'lastName'], required: false }
          ]
        },
      ],
    });

    if (!createdAttendance) {
      throw new Error("Failed to retrieve newly created attendance record with details.");
    }

    return createdAttendance;
  } catch (error: any) {
    throw error;
  }
};

export const getAllAttendance = async (filters: AttendanceFilters): Promise<Array<InstanceType<typeof Attendance>>> => {
  try {
    const where: any = {};
    const include: any[] = [
      { model: MemberDbModel, as: 'attendeeMember', attributes: ['id', 'firstName', 'lastName'], required: false },
      { model: EventDbModel, as: 'attendedEvent', attributes: ['id', 'name', 'startTime'], required: false },
      {
        model: SermonDbModel,
        as: 'attendedSermon',
        attributes: ['id', 'title', 'datePreached'],
        required: false,
        include: [
          { model: MemberDbModel, as: 'speaker', attributes: ['id', 'firstName', 'lastName'], required: false }
        ]
      },
    ];

    if (filters.memberId) {
      where.memberId = filters.memberId;
    }
    if (filters.eventId) {
      where.eventId = filters.eventId;
    }
    if (filters.sermonId) {
      where.sermonId = filters.sermonId;
    }
    if (filters.attendanceType) {
      where.attendanceType = filters.attendanceType;
    }
    if (filters.attendanceDate) {
        where.attendanceDate = {
            [Op.gte]: new Date(filters.attendanceDate),
            [Op.lt]: new Date(new Date(filters.attendanceDate).setDate(new Date(filters.attendanceDate).getDate() + 1))
        };
    }

    const attendanceRecords = await AttendanceDbModel.findAll({
      where,
      limit: filters.limit ? Number(filters.limit) : undefined,
      offset: filters.offset ? Number(filters.offset) : undefined,
      order: [['attendanceDate', 'DESC']],
      include: include,
    });
    return attendanceRecords;
  } catch (error: any) {
    throw new Error(`Service error fetching all attendance records: ${error.message}`);
  }
};

export const getAttendanceById = async (id: number): Promise<InstanceType<typeof Attendance> | null> => {
  try {
    const attendanceRecord = await AttendanceDbModel.findByPk(id, {
      include: [
        { model: MemberDbModel, as: 'attendeeMember', attributes: ['id', 'firstName', 'lastName'], required: false },
        { model: EventDbModel, as: 'attendedEvent', attributes: ['id', 'name', 'startTime'], required: false },
        {
          model: SermonDbModel,
          as: 'attendedSermon',
          attributes: ['id', 'title', 'datePreached'],
          required: false,
          include: [
            { model: MemberDbModel, as: 'speaker', attributes: ['id', 'firstName', 'lastName'], required: false }
          ]
        },
      ],
    });
    return attendanceRecord;
  } catch (error: any) {
    throw new Error(`Service error fetching attendance record by ID ${id}: ${error.message}`);
  }
};

export const updateAttendance = async (id: number, attendanceData: {
  memberId?: number | null;
  guestName?: string | null;
  attendanceDate?: Date;
  eventId?: number | null;
  sermonId?: number | null;
  attendanceType?: 'In-person' | 'Online' | 'Other';
  notes?: string | null;
}): Promise<InstanceType<typeof Attendance> | null> => {
  try {
    const { memberId, guestName, eventId, sermonId, ...rest } = attendanceData;

    if (memberId !== undefined && memberId !== null) {
      const member = await MemberDbModel.findByPk(memberId);
      if (!member) {
        throw new Error(`Member with ID ${memberId} not found for update.`);
      }
    }

    if (eventId !== undefined && eventId !== null) {
      const event = await EventDbModel.findByPk(eventId);
      if (!event) {
        throw new Error(`Event with ID ${eventId} not found for update.`);
      }
    }

    if (sermonId !== undefined && sermonId !== null) {
      const sermon = await SermonDbModel.findByPk(sermonId);
      if (!sermon) {
        throw new Error(`Sermon with ID ${sermonId} not found for update.`);
      }
    }

    const [updatedRowsCount] = await AttendanceDbModel.update({ memberId, guestName, eventId, sermonId, ...rest }, {
      where: { id },
    });

    if (updatedRowsCount === 0) {
      return null;
    }

    const updatedAttendance = await AttendanceDbModel.findByPk(id, {
      include: [
        { model: MemberDbModel, as: 'attendeeMember', attributes: ['id', 'firstName', 'lastName'], required: false },
        { model: EventDbModel, as: 'attendedEvent', attributes: ['id', 'name', 'startTime'], required: false },
        {
          model: SermonDbModel,
          as: 'attendedSermon',
          attributes: ['id', 'title', 'datePreached'],
          required: false,
          include: [
            { model: MemberDbModel, as: 'speaker', attributes: ['id', 'firstName', 'lastName'], required: false }
          ]
        },
      ],
    });
    return updatedAttendance;
  } catch (error: any) {
    throw new Error(`Service error updating attendance recod with the ID ${id}: ${error.message}`);
  }
};

export const deleteAttendance = async (id: number): Promise<number> => {
  try {
    const deletedRowCount = await AttendanceDbModel.destroy({
      where: { id },
    });
    return deletedRowCount;
  } catch (error: any) {
    throw new Error(`Service error deleting attendance record with ID ${id}: ${error.message}`);
  }
};