import { NextFunction, Request, Response } from 'express';
import * as memberService from './member.service';
import { paginationSchema } from '../common/pagination';
import { NotFoundError } from '../utils/errors';

export const createMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await memberService.createMember(req.body));
  } catch (error) {
    next(error);
  }
};

export const getAllMembers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pagination = paginationSchema.parse(req.query);
    res.status(200).json(await memberService.getAllMembers(pagination));
  } catch (error) {
    next(error);
  }
};

export const getMemberById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await memberService.getMemberById(Number(req.params.id));
    if (!member) {
      throw new NotFoundError('Member not found.');
    }
    res.status(200).json(member);
  } catch (error) {
    next(error);
  }
};

export const updateMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json(await memberService.updateMember(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
};

export const deleteMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await memberService.deleteMember(Number(req.params.id));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
