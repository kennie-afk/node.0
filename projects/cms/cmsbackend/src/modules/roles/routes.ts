import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { input, requestTx, route } from '../../common/http';
import { currentTenant } from '../../common/tenant-context';
import { PERMISSIONS, PERMISSION_INFO, ROLE_KEY_PATTERN } from '../../auth/permissions';
import type { RouteMount } from '../types';
import * as svc from './roles.service';

const router = Router();
router.use(authenticateToken, requirePermission('users:manage'));

const key = z.string().regex(ROLE_KEY_PATTERN, 'a role key is 2-20 capital letters, digits or underscores, starting with a letter');
const fields = {
  label: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).nullish(),
  permissions: z.array(z.string().max(40)).max(PERMISSIONS.length)
};

router.get('/', route(async () => svc.listRoles(await requestTx(), currentTenant().churchId)));

/** The permissions that exist, grouped, for the role editor. */
router.get('/permissions', route(async () => PERMISSIONS.map((permission) => ({ permission, ...PERMISSION_INFO[permission] }))));

router.post('/', route(async (req) => {
  const { body } = input(z.object({ body: z.object({ key, ...fields }).strict() }), req);
  const ctx = currentTenant();
  return svc.createRole(await requestTx(), ctx.churchId, ctx.permissions, body.key, body);
}, 201));

router.put('/:key', route(async (req) => {
  const { params, body } = input(z.object({ params: z.object({ key }), body: z.object({ label: fields.label.optional(), description: fields.description, permissions: fields.permissions.optional() }).strict() }), req);
  const ctx = currentTenant();
  return svc.updateRole(await requestTx(), ctx.churchId, ctx.permissions, params.key, body);
}));

router.delete('/:key', route(async (req) => {
  const { params } = input(z.object({ params: z.object({ key }) }), req);
  await svc.deleteRole(await requestTx(), currentTenant().churchId, params.key);
  return undefined;
}, 204));

export default [{ path: '/roles', router }] satisfies RouteMount[];
