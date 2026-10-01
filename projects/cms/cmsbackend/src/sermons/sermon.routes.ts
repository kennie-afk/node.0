import { Router } from 'express';
import {
  createSermon,
  getAllSermons,
  getSermonById,
  updateSermon,
  deleteSermon,
} from './sermon.controller';
import { validate } from '../middleware/validation.middleware';
import { createSermonSchema, updateSermonSchema } from './sermon.schemas';
import { authenticateToken, requirePermission } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, requirePermission('members:write'), validate(createSermonSchema), createSermon);
router.get('/', authenticateToken, requirePermission('members:read'), getAllSermons);
router.get('/:id', authenticateToken, requirePermission('members:read'), getSermonById);
router.put('/:id', authenticateToken, requirePermission('members:write'), validate(updateSermonSchema), updateSermon);
router.delete('/:id', authenticateToken, requirePermission('members:write'), deleteSermon);

export default router;

