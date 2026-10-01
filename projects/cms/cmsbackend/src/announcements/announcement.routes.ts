import { Router } from 'express';
import {
  createAnnouncement,
  getAllAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
} from './announcement.controller';
import { validate } from '../middleware/validation.middleware';
import { createAnnouncementSchema, updateAnnouncementSchema } from './announcement.schemas';
import { authenticateToken, requirePermission } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, requirePermission('members:write'), validate(createAnnouncementSchema), createAnnouncement);
router.get('/', authenticateToken, requirePermission('members:read'), getAllAnnouncements);
router.get('/:id', authenticateToken, requirePermission('members:read'), getAnnouncementById);
router.put('/:id', authenticateToken, requirePermission('members:write'), validate(updateAnnouncementSchema), updateAnnouncement);
router.delete('/:id', authenticateToken, requirePermission('members:write'), deleteAnnouncement);

export default router;
