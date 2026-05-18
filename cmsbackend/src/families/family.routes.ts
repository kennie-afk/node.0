import { Router } from 'express';
import {
  createFamily,
  getAllFamilies,
  getFamilyById,
  updateFamily,
  deleteFamily,
} from './family.controller';
import { validate } from '../middleware/validation.middleware';
import { createFamilySchema, updateFamilySchema } from './family.schemas';
import { authenticateToken, authorizeAdmin } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, authorizeAdmin, validate(createFamilySchema), createFamily);
router.get('/', authenticateToken, getAllFamilies);
router.get('/:id', authenticateToken, getFamilyById);
router.put('/:id', authenticateToken, authorizeAdmin, validate(updateFamilySchema), updateFamily);
router.delete('/:id', authenticateToken, authorizeAdmin, deleteFamily);

export default router;
