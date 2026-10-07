import { NextFunction, Request, Response } from 'express';
import * as memberService from './member.service';
import { keysetParams, paginationSchema, wantsOffsetPaging } from '../common/pagination';
import { NotFoundError } from '../utils/errors';
import { listMembersSchema } from './member.schemas';

export const createMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await memberService.createMember(req.body));
  } catch (error) {
    next(error);
  }
};

export const getAllMembers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query } = listMembersSchema.parse({ query: req.query });
    const filter = {
      q: query.q ?? '',
      status: query.status,
      familyId: query.familyId,
      ministryId: query.ministryId,
      smallGroupId: query.smallGroupId,
      joinedFrom: query.joinedFrom,
      joinedTo: query.joinedTo
    };
    // Cursor paging (no count) by default; `page=` keeps the older numbered shape for callers that need a total.
    if (wantsOffsetPaging(req.query)) {
      res.status(200).json(await memberService.getAllMembers(paginationSchema.parse(req.query), filter));
      return;
    }
    const { limit, cursor } = keysetParams(req.query);
    res.status(200).json(await memberService.listMembersKeyset(filter, limit, cursor));
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

export const getMemberProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json(await memberService.getMemberProfile(Number(req.params.id)));
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
