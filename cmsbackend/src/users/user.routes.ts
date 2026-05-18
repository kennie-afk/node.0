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
import { authenticateToken, authorizeAdmin } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, authorizeAdmin, validate(createUserSchema), createUser);

router.get('/', authenticateToken, authorizeAdmin, getAllUsers);
router.get('/:id', authenticateToken, getUserById);
router.put('/:id', authenticateToken, validate(updateUserSchema), updateUser);
router.delete('/:id', authenticateToken, authorizeAdmin, deleteUser);

export default router;