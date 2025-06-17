import { Router } from 'express';                  
import {
  createMember,
  getAllMembers,
  getMemberById,
  updateMember,
  deleteMember,
} from './member.controller'; 

const router = Router();

router.post('/', createMember);         
router.get('/', getAllMembers);          
router.get('/:id', getMemberById);      
router.put('/:id', updateMember);       
router.delete('/:id', deleteMember);     

export default router; 