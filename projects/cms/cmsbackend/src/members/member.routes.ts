import { Router } from 'express';
import {
  createMember,
  getAllMembers,
  getMemberById,
  getMemberProfile,
  updateMember,
  deleteMember,
} from './member.controller';
import { validate } from '../middleware/validation.middleware';
import { createMemberSchema, updateMemberSchema } from './member.schemas';
import { authenticateToken, requirePermission } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, requirePermission('members:write'), validate(createMemberSchema), createMember);
router.get('/', authenticateToken, requirePermission('members:read'), getAllMembers);
router.get('/:id/profile', authenticateToken, requirePermission('members:read'), getMemberProfile);
router.get('/:id', authenticateToken, requirePermission('members:read'), getMemberById);
router.put('/:id', authenticateToken, requirePermission('members:write'), validate(updateMemberSchema), updateMember);
router.delete('/:id', authenticateToken, requirePermission('members:write'), deleteMember);

export default router;