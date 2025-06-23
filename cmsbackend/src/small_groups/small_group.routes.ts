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

const router = Router();

router.post('/', createSmallGroup);
router.get('/', getAllSmallGroups);
router.get('/:id', getSmallGroupById);
router.put('/:id', updateSmallGroup);
router.delete('/:id', deleteSmallGroup);

router.post('/:smallGroupId/members/:memberId', addMemberToSmallGroup);
router.delete('/:smallGroupId/members/:memberId', removeMemberFromSmallGroup);
router.get('/:smallGroupId/members', getMembersOfSmallGroup);

export default router;