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

const router = Router();

router.post('/', createMinistry);
router.get('/', getAllMinistries);
router.get('/:id', getMinistryById);
router.put('/:id', updateMinistry);
router.delete('/:id', deleteMinistry);

router.post('/:ministryId/members/:memberId', addMemberToMinistry);
router.delete('/:ministryId/members/:memberId', removeMemberFromMinistry);
router.get('/:ministryId/members', getMembersOfMinistry);

export default router;