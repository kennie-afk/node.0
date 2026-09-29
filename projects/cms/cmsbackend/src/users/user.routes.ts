import { Router } from 'express';
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
} from './user.controller';

import { validate } from '../middleware/validation.middleware';
import { createUserSchema, updateUserSchema } from './user.schemas';
import {
  authenticateToken,
  authorizeAdmin,
  authorizeSelfOrAdmin,
  forbidSelfPromotion
} from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, authorizeAdmin, validate(createUserSchema), createUser);

router.get('/', authenticateToken, authorizeAdmin, getAllUsers);
router.get('/:id', authenticateToken, authorizeSelfOrAdmin, getUserById);
router.put('/:id', authenticateToken, authorizeSelfOrAdmin, forbidSelfPromotion, validate(updateUserSchema), updateUser);
router.delete('/:id', authenticateToken, authorizeAdmin, deleteUser);

export default router;