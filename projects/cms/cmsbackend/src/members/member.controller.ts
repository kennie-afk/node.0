import { Request, Response } from 'express';
import * as memberService from './member.service';
import { NotFoundError } from '../utils/errors';

export const createMember = async (req: Request, res: Response): Promise<Response> => {
  try {
    const newMember = await memberService.createMember(req.body);
    return res.status(201).json(newMember);
  } catch (error: any) {
    throw error;
  }
};

export const getAllMembers = async (req: Request, res: Response): Promise<Response> => {
  try {
    const members = await memberService.getAllMembers();
    return res.status(200).json(members);
  } catch (error: any) {
    throw error;
  }
};

export const getMemberById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const member = await memberService.getMemberById(Number(req.params.id));
    if (!member) {
      throw new NotFoundError('Member not found.');
    }
    return res.status(200).json(member);
  } catch (error: any) {
    throw error;
  }
};


export const updateMember = async (req: Request, res: Response): Promise<Response> => {
  try {
    const updatedMember = await memberService.updateMember(Number(req.params.id), req.body);
    if (!updatedMember) {
      throw new NotFoundError('Member not found or no changes made.');
    }
    return res.status(200).json(updatedMember);
  } catch (error: any) {
    throw error;
  }
};

export const deleteMember = async (req: Request, res: Response): Promise<Response> => {
  try {
    const deletedRowCount = await memberService.deleteMember(Number(req.params.id));
    if (deletedRowCount === 0) {
      throw new NotFoundError('Member not found.');
    }
    return res.status(204).send();
  } catch (error: any) {
    throw error;
  }
};
