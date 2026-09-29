import { authenticateToken, authorizeAdmin } from '../middleware/auth.middleware';
import { Router } from 'express';
import { validate } from '../middleware/validation.middleware';
import { createAttendanceSchema, updateAttendanceSchema } from './attendance.schemas';
import {
  createAttendance,
  getAllAttendance,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
} from './attendance.controller';

const router = Router();

router.post('/', authenticateToken, authorizeAdmin, validate(createAttendanceSchema), createAttendance);
router.get('/', authenticateToken, getAllAttendance);
router.get('/:id', authenticateToken, getAttendanceById);
router.put('/:id', authenticateToken, authorizeAdmin, validate(updateAttendanceSchema), updateAttendance);
router.delete('/:id', authenticateToken, authorizeAdmin, deleteAttendance);

export default router;