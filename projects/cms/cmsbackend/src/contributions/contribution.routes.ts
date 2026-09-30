import { Router } from 'express';
import {
  createContribution,
  getAllContributions,
  getContributionById,
  updateContribution,
  deleteContribution
} from './contribution.controller';
import { authenticateToken, requirePermission } from '../middleware/auth.middleware';

const router = Router();

// Individual giving stays restricted: treasurers and admins write, pastors and auditors may read.
router.post('/', authenticateToken, requirePermission('giving:write'), createContribution);
router.get('/', authenticateToken, requirePermission('giving:read'), getAllContributions);
router.get('/:id', authenticateToken, requirePermission('giving:read'), getContributionById);
router.put('/:id', authenticateToken, requirePermission('giving:write'), updateContribution);
router.delete('/:id', authenticateToken, requirePermission('giving:write'), deleteContribution);

export default router;
