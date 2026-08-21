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
import { authenticateToken, authorizeAdmin } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, authorizeAdmin, validate(createMinistrySchema), createMinistry);
router.get('/', authenticateToken, getAllMinistries);
router.get('/:id', authenticateToken, getMinistryById);
router.put('/:id', authenticateToken, authorizeAdmin, validate(updateMinistrySchema), updateMinistry);
router.delete('/:id', authenticateToken, authorizeAdmin, deleteMinistry);

router.post('/:ministryId/members', authenticateToken, authorizeAdmin, validate(addMemberSchema), addMemberToMinistry);
router.delete('/:ministryId/members', authenticateToken, authorizeAdmin, validate(removeMemberSchema), removeMemberFromMinistry);
router.get('/:ministryId/members', authenticateToken, getMembersOfMinistry);

export default router;
