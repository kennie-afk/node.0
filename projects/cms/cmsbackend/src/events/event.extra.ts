import { NextFunction, Request, Response } from 'express';
import { currentTenant } from '../common/tenant-context';
import { requestTx } from '../common/http';
import service from './event.service';
import * as rsvp from './rsvp.service';
import { occurrencesSchema, rsvpCancelSchema, rsvpCreateSchema, rsvpListSchema } from './event.schemas';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

export const listOccurrences = wrap(async (req, res) => {
  const { query } = occurrencesSchema.parse({ query: req.query });
  res.json(await rsvp.occurrencesInWindow(await requestTx(), currentTenant().churchId, query.from, query.to));
});

export const listRsvps = wrap(async (req, res) => {
  const { params, query } = rsvpListSchema.parse({ params: req.params, query: req.query });
  res.json(await rsvp.roster(await requestTx(), currentTenant().churchId, Number(params.id), query.date));
});

export const createRsvp = wrap(async (req, res) => {
  const { params, body } = rsvpCreateSchema.parse({ params: req.params, body: req.body });
  const { churchId, userId } = currentTenant();
  res.status(201).json(await rsvp.register(await requestTx(), churchId, userId, Number(params.id), body));
});

export const cancelRsvp = wrap(async (req, res) => {
  const { params } = rsvpCancelSchema.parse({ params: req.params });
  res.json(await rsvp.cancel(await requestTx(), currentTenant().churchId, Number(params.id), Number(params.rsvpId)));
});

/** Updating an event keeps the generic CRUD behaviour; a changed capacity then re-offers freed seats to the waitlist. */
export const updateEventAndPromote = wrap(async (req, res) => {
  const updated = await service.update(Number(req.params.id), req.body);
  const promoted = 'capacity' in req.body ? await rsvp.promoteWaitlist(await requestTx(), currentTenant().churchId, Number(req.params.id)) : [];
  res.json(promoted.length ? { ...JSON.parse(JSON.stringify(updated)), promotedFromWaitlist: promoted } : updated);
});
