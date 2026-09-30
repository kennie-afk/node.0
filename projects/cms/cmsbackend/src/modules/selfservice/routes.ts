import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { input, requestTx, route } from '../../common/http';
import { idParam, limitQuery } from '../finance/schemas';
import { me, requireLinkedMember } from '../ops-kit';
import type { RouteMount } from '../types';
import * as svc from './selfservice.service';
import { createPrayerRequest } from '../care/care.service';
import { listConsents, recordConsent, CONSENT_PURPOSES } from '../dataops/consent.service';

const self = Router();
self.use(authenticateToken);
const tx = () => requestTx();
const c = () => { const m = me(); return [m.churchId, m.userId] as const; };

self.get('/', route(async () => svc.profile(await tx(), ...c())));
self.put('/profile', route(async (req) => svc.updateProfile(await tx(), ...c(), input(z.object({ body: z.object({ phoneNumber: z.string().max(20).nullish(), email: z.string().email().max(100).nullish(), address: z.string().max(255).nullish(), city: z.string().max(100).nullish(), county: z.string().max(100).nullish(), postalCode: z.string().max(20).nullish() }).strict() }), req).body as any)));
self.get('/groups', route(async () => svc.groups(await tx(), ...c())));
self.get('/events', route(async () => svc.events(await tx(), ...c())));
self.get('/family', route(async () => svc.family(await tx(), ...c())));
self.get('/giving', route(async (req) => svc.giving(await tx(), ...c(), input(z.object({ query: z.object({ year: z.coerce.number().int().min(2000).max(2100).optional(), limit: limitQuery, cursor: z.string().max(200).optional() }) }), req).query)));

self.post('/prayer-requests', route(async (req) => {
  const { body } = input(z.object({ body: z.object({ body: z.string().min(2).max(2000), isPrivate: z.boolean().default(true) }) }), req);
  const t = await tx();
  const [churchId, userId] = c();
  const memberId = await requireLinkedMember(t, churchId, userId);
  return createPrayerRequest(t, churchId, userId, { memberId, body: body.body, isPrivate: body.isPrivate });
}, 201));

self.get('/consents', route(async () => {
  const t = await tx();
  const [churchId, userId] = c();
  return listConsents(t, churchId, await requireLinkedMember(t, churchId, userId));
}));
self.post('/consents', route(async (req) => {
  const { body } = input(z.object({ body: z.object({ purpose: z.enum(CONSENT_PURPOSES), channel: z.enum(['SMS', 'EMAIL', 'ANY']).default('ANY'), granted: z.boolean() }) }), req);
  const t = await tx();
  const [churchId, userId] = c();
  const memberId = await requireLinkedMember(t, churchId, userId);
  await recordConsent(t, churchId, { memberId, ...body, source: 'SELF', userId });
  return listConsents(t, churchId, memberId);
}, 201));

const links = Router();
links.use(authenticateToken);
links.get('/', requirePermission('users:manage'), route(async () => svc.listLinks(await tx(), me().churchId)));
links.post('/', requirePermission('users:manage'), route(async (req) => {
  const { body } = input(z.object({ body: z.object({ userId: z.number().int().positive(), memberId: z.number().int().positive() }) }), req);
  return svc.linkAccount(await tx(), me().churchId, me().userId, body.userId, body.memberId);
}, 201));
links.delete('/:userId', requirePermission('users:manage'), route(async (req) => {
  const p = input(z.object({ params: z.object({ userId: idParam.shape.id }) }), req).params;
  await svc.unlinkAccount(await tx(), me().churchId, me().userId, p.userId);
  return undefined;
}, 204));

const mounts: RouteMount[] = [
  { path: '/me', router: self },
  { path: '/account-links', router: links }
];
export default mounts;
