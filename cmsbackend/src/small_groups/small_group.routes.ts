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
import { authenticateToken, authorizeAdmin } from '../middleware/auth.middleware';
import {
  createSmallGroupSchema,
  updateSmallGroupSchema,
  smallGroupParamSchema,
  smallGroupMemberParamSchema,
  smallGroupMemberBodySchema
} from './small_group.schemas';

const router = Router();

router.post('/', authenticateToken, authorizeAdmin, validate(createSmallGroupSchema), createSmallGroup);
router.get('/', authenticateToken, getAllSmallGroups);
router.get('/:id', authenticateToken, validate(smallGroupParamSchema), getSmallGroupById);
router.put('/:id', authenticateToken, authorizeAdmin, validate(updateSmallGroupSchema), updateSmallGroup);
router.delete('/:id', authenticateToken, authorizeAdmin, validate(smallGroupParamSchema), deleteSmallGroup);

router.post('/:smallGroupId/members/:memberId', authenticateToken, authorizeAdmin, validate(smallGroupMemberParamSchema), validate(smallGroupMemberBodySchema), addMemberToSmallGroup);
router.delete('/:smallGroupId/members/:memberId', authenticateToken, authorizeAdmin, validate(smallGroupMemberParamSchema), removeMemberFromSmallGroup);
router.get('/:smallGroupId/members', authenticateToken, validate(smallGroupParamSchema), getMembersOfSmallGroup);

export default router;
