import { Router } from 'express';
import {
  createSermon,
  getAllSermons,
  getSermonById,
  updateSermon,
  deleteSermon,
} from './sermon.controller';

const router = Router();

router.post('/', createSermon);
router.get('/', getAllSermons);
router.get('/:id', getSermonById);
router.put('/:id', updateSermon);
router.delete('/:id', deleteSermon);

export default router;