/**
 * The vocabulary of permission names, as TYPES ONLY, so a typo in a route guard or menu entry
 * fails to compile. Who holds which permission is not decided here: the server sends the signed-in
 * user's permissions with the sign-in response and the role list from GET /auth/roles. Adding or
 * changing a role is a backend change alone.
 */
export type Permission =
  | 'members:read' | 'members:write'
  | 'giving:read' | 'giving:write'
  | 'finance:read' | 'finance:post' | 'finance:approve' | 'finance:close' | 'finance:settings'
  | 'payroll:read' | 'payroll:run' | 'payroll:approve'
  | 'audit:read'
  | 'care:read' | 'care:write'
  | 'comms:send'
  | 'users:manage';

/** A role is a name the server defines; the console never lists them itself. */
export type Role = string;

/** A token issued before roles existed only carries isAdmin. */
export function effectiveRole(role: unknown, isAdmin: boolean): Role {
  if (isAdmin) return 'ADMIN';
  return typeof role === 'string' && role.length > 0 ? role : 'MEMBER';
}

export function can(granted: readonly string[], permission: Permission): boolean {
  return granted.includes(permission);
}

export function canAny(granted: readonly string[], permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(granted, permission));
}

/** A readable name for a role key the console has no label for (the server normally sends the label). */
export const roleLabelFallback = (role: string): string => role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, ' ');
