import db from '@models';
import { Event } from './event.model';
import { User } from '../users/user.model';

const EventDbModel = db.Event;
const UserDbModel = db.User;

export const createEvent = async (eventData: {
  name: string;
  description?: string;
  type?: 'Service' | 'Meeting' | 'Outreach' | 'Conference' | 'Other';
  startTime: Date;
  endTime?: Date;
  location?: string;
  organizerUserId?: number;
  isRecurring?: boolean;
  recurrencePattern?: string;
}): Promise<InstanceType<typeof Event>> => {
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
  } catch (error: any) {
    throw new Error(`Service error creating event: ${error.message}`);
  }
};

export const getAllEvents = async (): Promise<Array<InstanceType<typeof Event>>> => {
  try {
    const events = await EventDbModel.findAll({
      include: [{ model: db.User, as: 'organizer' }]
    });
    return events;
  } catch (error: any) {
    throw new Error(`Service error fetching all events: ${error.message}`);
  }
};

export const getEventById = async (id: number): Promise<InstanceType<typeof Event> | null> => {
  try {
    const event = await EventDbModel.findByPk(id, {
      include: [{ model: db.User, as: 'organizer' }]
    });
    return event;
  } catch (error: any) {
    throw new Error(`Service error fetching event by ID ${id}: ${error.message}`);
  }
};

export const updateEvent = async (id: number, eventData: {
  name?: string;
  description?: string;
  type?: 'Service' | 'Meeting' | 'Outreach' | 'Conference' | 'Other';
  startTime?: Date;
  endTime?: Date;
  location?: string;
  organizerUserId?: number;
  isRecurring?: boolean;
  recurrencePattern?: string;
}): Promise<InstanceType<typeof Event> | null> => {
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
      include: [{ model: db.User, as: 'organizer' }]
    });
    return updatedEvent;
  } catch (error: any) {
    throw new Error(`Service error updating event with ID ${id}: ${error.message}`);
  }
};

export const deleteEvent = async (id: number): Promise<number> => {
  try {
    const deletedRowCount = await EventDbModel.destroy({
      where: { id },
    });
    return deletedRowCount;
  } catch (error: any) {
    throw new Error(`Service error deleting event with ID ${id}: ${error.message}`);
  }
};