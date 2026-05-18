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
import { authenticateToken, authorizeAdmin } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, authorizeAdmin, validate(createSermonSchema), createSermon);
router.get('/', authenticateToken, getAllSermons);
router.get('/:id', authenticateToken, getSermonById);
router.put('/:id', authenticateToken, authorizeAdmin, validate(updateSermonSchema), updateSermon);
router.delete('/:id', authenticateToken, authorizeAdmin, deleteSermon);

export default router;

