import db from '@models';
import * as eventService from '@events/event.service';
import { Sermon } from './sermon.model';
import { Member } from '../members/member.model';
import { Event } from '../events/event.model';

const SermonDbModel = db.Sermon;
const MemberDbModel = db.Member;
const EventDbModel = db.Event;

export const createSermon = async (sermonData: {
  title: string;
  speakerMemberId?: number;
  datePreached: Date;
  passageReference?: string;
  summary?: string;
  audioUrl?: string;
  videoUrl?: string;
  notes?: string;
}): Promise<InstanceType<typeof Sermon>> => {
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
    } catch (eventCreationError: any) {
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
  } catch (error: any) {
    throw new Error(`Service error creating sermon: ${error.message}`);
  }
};

export const getAllSermons = async (): Promise<Array<InstanceType<typeof Sermon>>> => {
  try {
    const sermons = await SermonDbModel.findAll({
      include: [
        { model: db.Member, as: 'speaker' },
        { model: db.Event, as: 'event' }
      ]
    });
    return sermons;
  } catch (error: any) {
    throw new Error(`Service error fetching all sermons: ${error.message}`);
  }
};

export const getSermonById = async (id: number): Promise<InstanceType<typeof Sermon> | null> => {
  try {
    const sermon = await SermonDbModel.findByPk(id, {
      include: [
        { model: db.Member, as: 'speaker' },
        { model: db.Event, as: 'event' }
      ]
    });
    return sermon;
  } catch (error: any) {
    throw new Error(`Service error fetching sermon by ID ${id}: ${error.message}`);
  }
};

export const updateSermon = async (id: number, sermonData: {
  title?: string;
  speakerMemberId?: number;
  eventId?: number;
  datePreached?: Date;
  passageReference?: string;
  summary?: string;
  audioUrl?: string;
  videoUrl?: string;
  notes?: string;
}): Promise<InstanceType<typeof Sermon> | null> => {
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
        { model: db.Member, as: 'speaker' },
        { model: db.Event, as: 'event' }
      ]
    });
    return updatedSermon;
  } catch (error: any) {
    throw new Error(`Service error updating sermon with ID ${id}: ${error.message}`);
  }
};

export const deleteSermon = async (id: number): Promise<number> => {
  try {
    const deletedRowCount = await SermonDbModel.destroy({
      where: { id },
    });
    return deletedRowCount;
  } catch (error: any) {
    throw new Error(`Service error deleting sermon with ID ${id}: ${error.message}`);
  }
};