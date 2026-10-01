import { Router } from 'express';
import {
  createSmallGroup,
  getAllSmallGroups,
  getSmallGroupById,
  updateSmallGroup,
  deleteSmallGroup,
  addMemberToSmallGroup,
  removeMemberFromSmallGroup,
  getMembersOfSmallGroup
} from './small_group.controller';
import { validate } from '../middleware/validation.middleware';
import { authenticateToken, requirePermission } from '../middleware/auth.middleware';
import {
  createSmallGroupSchema,
  updateSmallGroupSchema,
  smallGroupParamSchema,
  smallGroupRosterParamSchema,
  smallGroupMemberParamSchema,
  smallGroupMemberBodySchema
} from './small_group.schemas';

const router = Router();

router.post('/', authenticateToken, requirePermission('members:write'), validate(createSmallGroupSchema), createSmallGroup);
router.get('/', authenticateToken, requirePermission('members:read'), getAllSmallGroups);
router.get('/:id', authenticateToken, requirePermission('members:read'), validate(smallGroupParamSchema), getSmallGroupById);
router.put('/:id', authenticateToken, requirePermission('members:write'), validate(updateSmallGroupSchema), updateSmallGroup);
router.delete('/:id', authenticateToken, requirePermission('members:write'), validate(smallGroupParamSchema), deleteSmallGroup);

router.post('/:smallGroupId/members/:memberId', authenticateToken, requirePermission('members:write'), validate(smallGroupMemberParamSchema), validate(smallGroupMemberBodySchema), addMemberToSmallGroup);
router.delete('/:smallGroupId/members/:memberId', authenticateToken, requirePermission('members:write'), validate(smallGroupMemberParamSchema), removeMemberFromSmallGroup);
router.get('/:smallGroupId/members', authenticateToken, requirePermission('members:read'), validate(smallGroupRosterParamSchema), getMembersOfSmallGroup);

export default router;
