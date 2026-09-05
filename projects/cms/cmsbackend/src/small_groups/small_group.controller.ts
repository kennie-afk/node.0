import { NextFunction, Request, Response } from 'express';
import { createCrudController } from '../common/crud-controller';
import { paginationSchema } from '../common/pagination';
import service, * as groupService from './small_group.service';

const controller = createCrudController(service, 'Small group');

export const createSmallGroup = controller.create;
export const getAllSmallGroups = controller.list;
export const getSmallGroupById = controller.getById;
export const updateSmallGroup = controller.update;
export const deleteSmallGroup = controller.remove;

export const addMemberToSmallGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const created = await groupService.addMemberToSmallGroup(
      Number(req.params.id),
      Number(req.body.memberId),
      req.body
    );
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
};

export const removeMemberFromSmallGroup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await groupService.removeMemberFromSmallGroup(Number(req.params.id), Number(req.params.memberId));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getMembersOfSmallGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = await groupService.getMembersOfSmallGroup(
      Number(req.params.id),
      paginationSchema.parse(req.query)
    );
    res.status(200).json(page);
  } catch (error) {
    next(error);
  }
};
