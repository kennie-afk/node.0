import { Router } from 'express';
import {
  createMember,
  getAllMembers,
  getMemberById,
  updateMember,
  deleteMember,
} from './member.controller';
import { validate } from '../middleware/validation.middleware';
import { createMemberSchema, updateMemberSchema } from './member.schemas';
import { authenticateToken, authorizeAdmin } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, authorizeAdmin, validate(createMemberSchema), createMember);
router.get('/', authenticateToken, getAllMembers);
router.get('/:id', authenticateToken, getMemberById);
router.put('/:id', authenticateToken, authorizeAdmin, validate(updateMemberSchema), updateMember);
router.delete('/:id', authenticateToken, authorizeAdmin, deleteMember);

export default router;