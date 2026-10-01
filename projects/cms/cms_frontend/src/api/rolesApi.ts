import { useEffect, useState } from 'react';
import axiosInstance from './axiosInstance';
import { http } from './http';
import { roleLabelFallback } from '../auth/permissions';

/** One church's role, as the server stores it. */
export interface ChurchRole {
  key: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount?: number;
}

export interface PermissionInfo {
  permission: string;
  group: string;
  description: string;
}

export interface RoleInput {
  label: string;
  description?: string | null;
  permissions: string[];
}

export const listRoles = () => http.get<ChurchRole[]>('/roles');
export const listPermissions = () => http.get<PermissionInfo[]>('/roles/permissions');
export const createRole = (key: string, body: RoleInput) => http.post<ChurchRole>('/roles', { key, ...body });
export const updateRole = (key: string, body: Partial<RoleInput>) => http.put<ChurchRole>(`/roles/${key}`, body);
export const deleteRole = (key: string) => http.delete(`/roles/${key}`);


/** The signed-in church's roles (needs the users:manage permission). */
export function useRoles() {
  const [roles, setRoles] = useState<ChurchRole[]>([]);
  useEffect(() => {
    let live = true;
    listRoles().then((r) => live && setRoles(r)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const labelOf = (role: string) => roles.find((r) => r.key === role)?.label ?? roleLabelFallback(role);
  return { roles, labelOf };
}

/** Role names for one church's sign-in picker. Names only; the server shows nothing more before sign-in. */
export function usePublicRoles(church: string, enabled: boolean) {
  const [roles, setRoles] = useState<Array<{ role: string; label: string }>>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    axiosInstance
      .get<Array<{ role: string; label: string }>>('/auth/roles', { params: { church } })
      .then((r) => live && setRoles(r.data))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [church, enabled]);
  return roles;
}

