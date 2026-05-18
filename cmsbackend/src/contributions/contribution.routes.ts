import { Router } from 'express';
import {
  createContribution,
  getAllContributions,
  getContributionById,
  updateContribution,
  deleteContribution,
} from './contribution.controller';
import { validate } from '../middleware/validation.middleware';
import { createContributionSchema, updateContributionSchema } from './contribution.schemas';
import { authenticateToken, authorizeAdmin } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, authorizeAdmin, validate(createContributionSchema), createContribution);
router.get('/', authenticateToken, authorizeAdmin, getAllContributions);
router.get('/:id', authenticateToken, getContributionById);
router.put('/:id', authenticateToken, authorizeAdmin, validate(updateContributionSchema), updateContribution);
router.delete('/:id', authenticateToken, authorizeAdmin, deleteContribution);

export default router;