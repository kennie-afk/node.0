import db from '@models';
import { Event } from './event.model';
import { BadRequestError } from '../utils/errors';

const EventDbModel = db.Event;

export const createEvent = async (eventData: Partial<Event>): Promise<Event> => {
  try {
    const newEvent = await EventDbModel.create(eventData);
    return newEvent;
  } catch (error: any) {
    throw new Error(`Service error creating event: ${error.message}`);
  }
};

export const getAllEvents = async (): Promise<Event[]> => {
  try {
    const events = await EventDbModel.findAll();
    return events;
  } catch (error: any) {
    throw new Error(`Service error fetching all events: ${error.message}`);
  }
};

export const getEventById = async (id: number): Promise<Event | null> => {
  try {
    const event = await EventDbModel.findByPk(id);
    return event;
  } catch (error: any) {
    throw new Error(`Service error fetching event by ID ${id}: ${error.message}`);
  }
};

export const updateEvent = async (id: number, eventData: Partial<Event>): Promise<Event | null> => {
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
