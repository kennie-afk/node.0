import { authenticateToken, authorizeAdmin } from '../middleware/auth.middleware';
import { Router } from 'express';
import {
  createAttendance,
  getAllAttendance,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
} from './attendance.controller';

const router = Router();

router.post('/', authenticateToken, authorizeAdmin, createAttendance);
router.get('/', authenticateToken, getAllAttendance);
router.get('/:id', authenticateToken, getAttendanceById);
router.put('/:id', authenticateToken, authorizeAdmin, updateAttendance);
router.delete('/:id', authenticateToken, authorizeAdmin, deleteAttendance);

export default router;