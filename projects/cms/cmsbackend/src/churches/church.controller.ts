import { NextFunction, Request, Response } from 'express';
import * as churchService from './church.service';

export const onboardChurch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await churchService.onboardChurch(req.body));
  } catch (error) {
    next(error);
  }
};
