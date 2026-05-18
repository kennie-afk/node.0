import { Request, Response } from 'express';
import * as eventService from './event.service';
import { NotFoundError } from '../utils/errors';

export const createEvent = async (req: Request, res: Response): Promise<Response> => {
  try {
    const newEvent = await eventService.createEvent(req.body);
    return res.status(201).json(newEvent);
  } catch (error: any) {
    throw error;
  }
};

export const getAllEvents = async (req: Request, res: Response): Promise<Response> => {
  try {
    const events = await eventService.getAllEvents();
    return res.status(200).json(events);
  } catch (error: any) {
    throw error;
  }
};

export const getEventById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const event = await eventService.getEventById(Number(req.params.id));
    if (!event) {
      throw new NotFoundError('Event not found.');
    }
    return res.status(200).json(event);
  } catch (error: any) {
    throw error;
  }
};

export const updateEvent = async (req: Request, res: Response): Promise<Response> => {
  try {
    const updatedEvent = await eventService.updateEvent(Number(req.params.id), req.body);
    if (!updatedEvent) {
      throw new NotFoundError('Event not found or no changes made.');
    }
    return res.status(200).json(updatedEvent);
  } catch (error: any) {
    throw error;
  }
};

export const deleteEvent = async (req: Request, res: Response): Promise<Response> => {
  try {
    const deletedRowCount = await eventService.deleteEvent(Number(req.params.id));
    if (deletedRowCount === 0) {
      throw new NotFoundError('Event not found.');
    }
    return res.status(204).send();
  } catch (error: any) {
    throw error;
  }
};
