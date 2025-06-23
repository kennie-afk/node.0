import { Router } from 'express';
import {
  createAttendance,
  getAllAttendance,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
} from './attendance.controller';

const router = Router();

router.post('/', createAttendance);
router.get('/', getAllAttendance);
router.get('/:id', getAttendanceById);
router.put('/:id', updateAttendance);
router.delete('/:id', deleteAttendance);

export default router;