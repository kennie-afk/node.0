import { NextFunction, Request, Response } from 'express';
import { CrudService } from './crud-service';
import { paginationSchema } from './pagination';
import { NotFoundError } from '../utils/errors';

export function createCrudController<T>(service: CrudService<T>, label: string) {
  return {
    create: async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.status(201).json(await service.create(req.body));
      } catch (error) {
        next(error);
      }
    },

    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.status(200).json(await service.list(paginationSchema.parse(req.query)));
      } catch (error) {
        next(error);
      }
    },

    getById: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const found = await service.findById(Number(req.params.id));
        if (!found) {
          throw new NotFoundError(`${label} not found.`);
        }
        res.status(200).json(found);
      } catch (error) {
        next(error);
      }
    },

    update: async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.status(200).json(await service.update(Number(req.params.id), req.body));
      } catch (error) {
        next(error);
      }
    },

    remove: async (req: Request, res: Response, next: NextFunction) => {
      try {
        await service.remove(Number(req.params.id));
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    }
  };
}
