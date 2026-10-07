import { Router } from 'express';
import {
  createSermon,
  getAllSermons,
  getSermonById,
  updateSermon,
  deleteSermon,
} from './sermon.controller';
import express from 'express';
import { env } from '../config/env';
import { addSermonMedia, deleteSermonAndMedia, listSermonMedia, sermonMediaLink, removeSermonMedia } from './media.controller';
import { validate } from '../middleware/validation.middleware';
import { createSermonSchema, updateSermonSchema } from './sermon.schemas';
import { authenticateToken, requirePermission } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, requirePermission('members:write'), validate(createSermonSchema), createSermon);
router.get('/', authenticateToken, requirePermission('members:read'), getAllSermons);
// Recordings and notes. The file is the raw request body (its own Content-Type), the name rides in ?fileName=.
const rawMedia = express.raw({ type: () => true, limit: env.MEDIA_MAX_BYTES });
router.get('/:id/media', authenticateToken, requirePermission('members:read'), listSermonMedia);
router.post('/:id/media', authenticateToken, requirePermission('members:write'), rawMedia, addSermonMedia);
router.get('/:id/media/:mediaId/link', authenticateToken, requirePermission('members:read'), sermonMediaLink);
router.delete('/:id/media/:mediaId', authenticateToken, requirePermission('members:write'), removeSermonMedia);
router.get('/:id', authenticateToken, requirePermission('members:read'), getSermonById);
router.put('/:id', authenticateToken, requirePermission('members:write'), validate(updateSermonSchema), updateSermon);
router.delete('/:id', authenticateToken, requirePermission('members:write'), deleteSermonAndMedia);

export default router;

