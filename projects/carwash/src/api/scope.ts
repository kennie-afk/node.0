import { Request } from 'express';
import { ForbiddenError } from '../domain/errors';

/**
 * A person tied to one site (every attendant, and any manager given a site) works inside it. For a
 * list, that means their own site whatever the query string asks for; for a named resource, asking for
 * another site is refused. People with no site (owners, support) see the whole organisation.
 */
export function listSite(req: Request): string | null {
  return req.principal!.siteId;
}

export function assertSiteAccess(req: Request, siteId: string | null | undefined): void {
  const own = req.principal!.siteId;
  if (own && siteId !== own) {
    throw new ForbiddenError('That belongs to another site.');
  }
}
