import { authenticateToken, requirePermission } from '../middleware/auth.middleware';
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

router.post('/', authenticateToken, requirePermission('members:write'), validate(createAttendanceSchema), createAttendance);
router.get('/', authenticateToken, requirePermission('members:read'), getAllAttendance);
router.get('/:id', authenticateToken, requirePermission('members:read'), getAttendanceById);
router.put('/:id', authenticateToken, requirePermission('members:write'), validate(updateAttendanceSchema), updateAttendance);
router.delete('/:id', authenticateToken, requirePermission('members:write'), deleteAttendance);

export default router;