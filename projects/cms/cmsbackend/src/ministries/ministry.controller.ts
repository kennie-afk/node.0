import { NextFunction, Request, Response } from 'express';
import { createCrudController } from '../common/crud-controller';
import { paginationSchema } from '../common/pagination';
import service, * as groupService from './ministry.service';

const controller = createCrudController(service, 'Ministry');

export const createMinistry = controller.create;
export const getAllMinistries = controller.list;
export const getMinistryById = controller.getById;
export const updateMinistry = controller.update;
export const deleteMinistry = controller.remove;

export const addMemberToMinistry = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const created = await groupService.addMemberToMinistry(
      Number(req.params.id),
      Number(req.body.memberId),
      req.body
    );
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
};

export const removeMemberFromMinistry = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await groupService.removeMemberFromMinistry(Number(req.params.id), Number(req.params.memberId));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getMembersOfMinistry = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = await groupService.getMembersOfMinistry(
      Number(req.params.id),
      paginationSchema.parse(req.query)
    );
    res.status(200).json(page);
  } catch (error) {
    next(error);
  }
};
