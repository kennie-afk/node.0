import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { CustomJwtPayload } from '../types/auth.types';
import { runWithTenant, currentTenantOrNull } from '../common/tenant-context';
import { bindTransactionToResponse, createTenantTx } from '../common/tenant-db';
import db from '@models';
import { effectiveRole, Permission } from '../auth/permissions';
import { resolvePermissions } from '../modules/roles/roles.service';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const token = bearer(req);

  if (!token) {
    return next(new UnauthorizedError('Authentication token required.'));
  }

  let claims: CustomJwtPayload;
  try {
    claims = jwt.verify(token, env.JWT_SECRET) as CustomJwtPayload;
  } catch {
    return next(new UnauthorizedError('Invalid or expired token.'));
  }

  if (typeof claims.churchId !== 'number' || typeof claims.id !== 'number') {
    return next(new UnauthorizedError('Token does not identify a church.'));
  }

  const role = effectiveRole(claims.role, Boolean(claims.isAdmin));
  req.user = { ...claims, role, isAdmin: role === 'ADMIN' };

  const tenantTx = createTenantTx(db.sequelize, claims.churchId);
  // Permissions come from the church's own role rows, not from the token: changing a role takes
  // effect on the next request (within the cache TTL), and a deleted role stops working at once.
  resolvePermissions(claims.churchId, role, tenantTx).then(
    (permissions) => {
      const context = {
        churchId: claims.churchId,
        userId: claims.id,
        isAdmin: role === 'ADMIN',
        role,
        permissions,
        requestId: req.id,
        tenantTx
      };
      bindTransactionToResponse(res, context);
      runWithTenant(context, () => next());
    },
    next
  );
};

/** Gate a route on a named permission rather than a role. */
export const requirePermission =
  (...permissions: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const held = currentTenantOrNull()?.permissions;
    if (held && permissions.some((permission) => held.has(permission))) {
      return next();
    }
    next(new ForbiddenError(`You do not have permission to do that (${permissions.join(' or ')}).`));
  };

export const tenantActive = () => currentTenantOrNull() !== null;

export const authorizeAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    return next(new ForbiddenError('Admin access required.'));
  }
  next();
};

/**
 * Admins may act on any user in their church; everyone else only on themselves. Without this
 * any signed-in member could rewrite another user's password or promote themselves.
 */
export const authorizeSelfOrAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.isAdmin || String(req.user?.id) === req.params.id) {
    return next();
  }
  next(new ForbiddenError('You may only access your own account.'));
};

/** Blocks non-admins from changing privilege, even on their own account. */
export const forbidSelfPromotion = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user?.isAdmin && req.body && ('isAdmin' in req.body || 'role' in req.body)) {
    return next(new ForbiddenError('Only an administrator can change admin access.'));
  }
  next();
};
