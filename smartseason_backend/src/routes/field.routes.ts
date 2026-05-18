import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { createField, getAllFields, getAgentFields, updateFieldStage } from '../controllers/FieldController';

const router = Router();

router.use(authenticate);

router.post('/', authorize(['ADMIN']), createField);
router.get('/', authorize(['ADMIN']), getAllFields);
router.get('/my-fields', authorize(['FIELD_AGENT']), getAgentFields);
router.put('/:id/update', authorize(['FIELD_AGENT']), updateFieldStage);

export { router as fieldRouter };