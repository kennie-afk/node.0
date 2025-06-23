'use strict';

import { Router } from 'express';
import {
  createContribution,
  getAllContributions,
  getContributionById,
  updateContribution,
  deleteContribution,
} from './contribution.controller';

const router = Router();

router.post('/', createContribution);
router.get('/', getAllContributions);
router.get('/:id', getContributionById);
router.put('/:id', updateContribution);
router.delete('/:id', deleteContribution);

export default router;