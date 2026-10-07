import { Router } from 'express';
import {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} from './event.controller';
import { cancelRsvp, createRsvp, listOccurrences, listRsvps, updateEventAndPromote } from './event.extra';
import { validate } from '../middleware/validation.middleware';
import { createEventSchema, updateEventSchema } from './event.schemas';
import { authenticateToken, requirePermission } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, requirePermission('members:write'), validate(createEventSchema), createEvent);
router.get('/', authenticateToken, requirePermission('members:read'), getAllEvents);
// Fixed paths before '/:id'.
router.get('/occurrences', authenticateToken, requirePermission('members:read'), listOccurrences);
router.get('/:id/rsvps', authenticateToken, requirePermission('members:read'), listRsvps);
router.post('/:id/rsvps', authenticateToken, requirePermission('members:write'), createRsvp);
router.delete('/:id/rsvps/:rsvpId', authenticateToken, requirePermission('members:write'), cancelRsvp);
router.get('/:id', authenticateToken, requirePermission('members:read'), getEventById);
router.put('/:id', authenticateToken, requirePermission('members:write'), validate(updateEventSchema), updateEventAndPromote);
router.delete('/:id', authenticateToken, requirePermission('members:write'), deleteEvent);

export default router;