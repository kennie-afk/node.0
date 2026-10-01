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
import { authenticateToken, requirePermission } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, requirePermission('members:write'), validate(createFamilySchema), createFamily);
router.get('/', authenticateToken, requirePermission('members:read'), getAllFamilies);
router.get('/:id', authenticateToken, requirePermission('members:read'), getFamilyById);
router.put('/:id', authenticateToken, requirePermission('members:write'), validate(updateFamilySchema), updateFamily);
router.delete('/:id', authenticateToken, requirePermission('members:write'), deleteFamily);

export default router;
