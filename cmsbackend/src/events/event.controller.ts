import { Request, Response } from 'express';
import * as eventService from './event.service';

export const createEvent = async (req: Request, res: Response): Promise<Response> => {
  try {
    const newEvent = await eventService.createEvent(req.body);
    return res.status(201).json(newEvent);
  } catch (error: any) {
    console.error('Error in createEvent controller:', error.message);
    if (error.message.includes('required.')) {
      return res.status(400).json({ message: error.message });
    }
    if (error.message.includes('not found.')) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to create event.' });
  }
};

export const getAllEvents = async (req: Request, res: Response): Promise<Response> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const { events, totalCount } = await eventService.getAllEvents(limit, offset);

    return res.status(200).json({
      data: events,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    console.error('Error in getAllEvents controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve events.' });
  }
};

export const getEventById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const event = await eventService.getEventById(Number(id));
    if (!event) {
      return res.status(404).json({ message: 'Event not found.' });
    }
    return res.status(200).json(event);
  }
  catch (error: any) {
    console.error('Error in getEventById controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve event.' });
  }
};

export const updateEvent = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const updatedEvent = await eventService.updateEvent(Number(id), req.body);
    if (!updatedEvent) {
      return res.status(404).json({ message: 'Event not found or no changes made.' });
    }
    return res.status(200).json(updatedEvent);
  } catch (error: any) {
    console.error('Error in updateEvent controller:', error.message);
    if (error.message.includes('not found for update.')) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to update event.' });
  }
};

export const deleteEvent = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedRowCount = await eventService.deleteEvent(Number(id));
    if (deletedRowCount === 0) {
      return res.status(404).json({ message: 'Event not found.' });
    }
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error in deleteEvent controller:', error.message);
    return res.status(500).json({ message: 'Failed to delete event.' });
  }
};