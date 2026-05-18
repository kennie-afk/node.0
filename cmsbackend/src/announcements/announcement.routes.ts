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
import { authenticateToken, authorizeAdmin } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, authorizeAdmin, validate(createAnnouncementSchema), createAnnouncement);
router.get('/', getAllAnnouncements);
router.get('/:id', getAnnouncementById);
router.put('/:id', authenticateToken, authorizeAdmin, validate(updateAnnouncementSchema), updateAnnouncement);
router.delete('/:id', authenticateToken, authorizeAdmin, deleteAnnouncement);

export default router;
