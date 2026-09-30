import type { ComponentType } from 'react';
import type { Permission } from '../auth/permissions';

export type NavGroupId =
  | 'overview'
  | 'people'
  | 'worship'
  | 'giving'
  | 'finance'
  | 'payables'
  | 'payroll'
  | 'reports'
  | 'operations'
  | 'data'
  | 'admin';

export interface NavItem {
  label: string;
  path: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  group: NavGroupId;
  /** Any one suffices. Omit for items every signed-in user sees. */
  permission?: Permission | readonly Permission[];
  /** Sort key inside the group (default 100); ties sort by label. */
  order?: number;
  /** Match the path exactly (for items like /attendance that have children elsewhere). */
  end?: boolean;
}

export interface NavGroup {
  id: NavGroupId;
  label: string;
  items: NavItem[];
}
