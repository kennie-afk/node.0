import { describe, expect, it } from 'vitest';
import { navFor } from '../../nav/registry';
import { opsNav } from '../../nav/ops.nav';
import { ROLES } from '../../auth/permissions';

const opsPaths = new Set(opsNav.map((i) => i.path));
const visible = (role: (typeof ROLES)[number]) => navFor(role).flatMap((g) => g.items).filter((i) => opsPaths.has(i.path)).map((i) => i.path);

describe('operations menu by role', () => {
  it('gives a plain member only the self-service entry from this area', () => {
    expect(visible('MEMBER')).toEqual(['/me']);
  });
  it('keeps messaging, care and privacy tools away from roles that cannot use them', () => {
    expect(visible('AUDITOR')).not.toContain('/comms');
    expect(visible('AUDITOR')).not.toContain('/care');
    expect(visible('SECRETARY')).toContain('/comms');
    expect(visible('PASTOR')).toEqual(expect.arrayContaining(['/care', '/comms', '/visitors', '/checkin']));
    expect(visible('PASTOR')).not.toContain('/data/erasure');
  });
  it('shows an administrator everything, including erasure and sign-in links', () => {
    const all = visible('ADMIN');
    for (const path of opsPaths) expect(all).toContain(path);
  });
  it('points every menu entry at a route that exists', async () => {
    const { opsRoutes } = await import('../../routes/ops.routes');
    const routePaths = opsRoutes.map((r) => (r.props as { path: string }).path);
    for (const item of opsNav) expect(routePaths, item.label).toContain(item.path);
  });
});
