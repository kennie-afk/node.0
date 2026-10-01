import { effectiveRole } from './permissions';
import { publicRoleNames, resolvePermissions, roleLabel } from '../modules/roles/roles.service';
import { NextFunction, Request, Response } from 'express';
import * as authService from './auth.service';
import { UnauthorizedError } from '../utils/errors';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const session = await authService.loginUser(email, password);
    res.status(200).json(session);
  } catch (error) {
    next(error);
  }
};

/** Role names for the sign-in picker of one church (?church=slug). Names only, never what a role can do. */
export const listRoles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = typeof req.query.church === 'string' ? req.query.church : '';
    res.status(200).json(slug ? await publicRoleNames(slug) : []);
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Unauthorized');
    }
    const user = await authService.getProfile(req.user.id, req.user.churchId);
    const role = effectiveRole(req.user.role, Boolean(req.user.isAdmin));
    res.status(200).json({
      ...user.toJSON(),
      role,
      roleLabel: await roleLabel(req.user.churchId, role),
      permissions: [...(await resolvePermissions(req.user.churchId, role))]
    });
  } catch (error) {
    next(error);
  }
};
