import { Router } from 'express';                  
import {
  createFamily,
  getAllFamilies,
  getFamilyById,
  updateFamily,
  deleteFamily,
} from '@controllers/family.controller'; 

const router = Router(); 

router.post('/', createFamily);             
router.get('/', getAllFamilies);            
router.get('/:id', getFamilyById);         
router.put('/:id', updateFamily);           
router.delete('/:id', deleteFamily);         

export default router; 