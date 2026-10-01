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
import { authenticateToken, requirePermission } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, requirePermission('members:write'), validate(createEventSchema), createEvent);
router.get('/', authenticateToken, requirePermission('members:read'), getAllEvents);
router.get('/:id', authenticateToken, requirePermission('members:read'), getEventById);
router.put('/:id', authenticateToken, requirePermission('members:write'), validate(updateEventSchema), updateEvent);
router.delete('/:id', authenticateToken, requirePermission('members:write'), deleteEvent);

export default router;