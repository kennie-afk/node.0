import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { currentTenant } from '../common/tenant-context';
import { requestTx } from '../common/http';
import { BadRequestError } from '../utils/errors';
import service from './sermon.service';
import * as media from './media.service';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};
const num = (v: unknown) => z.string().regex(/^\d+$/).transform(Number).parse(v);

export const listSermonMedia = wrap(async (req, res) => {
  res.json(await media.listMedia(await requestTx(), currentTenant().churchId, num(req.params.id)));
});

export const addSermonMedia = wrap(async (req, res) => {
  const { fileName } = z.object({ fileName: z.string().min(1).max(200) }).parse(req.query);
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new BadRequestError('send the file as the request body');
  const { churchId, userId } = currentTenant();
  res.status(201).json(await media.addMedia(await requestTx(), churchId, userId, num(req.params.id), { fileName, contentType: (req.header('content-type') ?? '').split(';')[0].trim(), body: req.body }));
});

export const sermonMediaLink = wrap(async (req, res) => {
  res.json(await media.mediaLink(await requestTx(), currentTenant().churchId, num(req.params.id), num(req.params.mediaId)));
});

export const removeSermonMedia = wrap(async (req, res) => {
  await media.removeMedia(await requestTx(), currentTenant().churchId, num(req.params.id), num(req.params.mediaId));
  res.status(204).end();
});

export const deleteSermonAndMedia = wrap(async (req, res) => {
  const id = num(req.params.id);
  const churchId = currentTenant().churchId;
  await service.findByIdOrFail(id);
  const keys = await media.sermonObjectKeys(await requestTx(), churchId, id);
  await service.remove(id);
  await media.deleteObjects(keys);
  res.status(204).end();
});
