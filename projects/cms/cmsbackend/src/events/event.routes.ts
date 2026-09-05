import { Router } from 'express';
import {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} from './event.controller';
import { validate } from '../middleware/validation.middleware';
import { createEventSchema, updateEventSchema } from './event.schemas';
import { authenticateToken, authorizeAdmin } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, authorizeAdmin, validate(createEventSchema), createEvent);
router.get('/', authenticateToken, getAllEvents);
router.get('/:id', authenticateToken, getEventById);
router.put('/:id', authenticateToken, authorizeAdmin, validate(updateEventSchema), updateEvent);
router.delete('/:id', authenticateToken, authorizeAdmin, deleteEvent);

export default router;