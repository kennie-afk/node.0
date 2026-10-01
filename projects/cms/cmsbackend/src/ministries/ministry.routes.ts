import { Router } from 'express';
import {
  createMinistry,
  getAllMinistries,
  getMinistryById,
  updateMinistry,
  deleteMinistry,
  addMemberToMinistry,
  removeMemberFromMinistry,
  getMembersOfMinistry
} from './ministry.controller';
import { validate } from '../middleware/validation.middleware';
import { createMinistrySchema, updateMinistrySchema, addMemberSchema, removeMemberSchema } from './ministry.schemas';
import { authenticateToken, requirePermission } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, requirePermission('members:write'), validate(createMinistrySchema), createMinistry);
router.get('/', authenticateToken, requirePermission('members:read'), getAllMinistries);
router.get('/:id', authenticateToken, requirePermission('members:read'), getMinistryById);
router.put('/:id', authenticateToken, requirePermission('members:write'), validate(updateMinistrySchema), updateMinistry);
router.delete('/:id', authenticateToken, requirePermission('members:write'), deleteMinistry);

router.post('/:ministryId/members', authenticateToken, requirePermission('members:write'), validate(addMemberSchema), addMemberToMinistry);
router.delete('/:ministryId/members', authenticateToken, requirePermission('members:write'), validate(removeMemberSchema), removeMemberFromMinistry);
router.get('/:ministryId/members', authenticateToken, requirePermission('members:read'), getMembersOfMinistry);

export default router;
