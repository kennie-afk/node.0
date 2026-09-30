import { Activity, Baby, Building2, Database, HeartPulse, Link2, MessageSquare, ShieldCheck, UserPlus, UserRound, Users2 } from 'lucide-react';
import type { NavItem } from './types';

/**
 * Operations-side menu entries. "My account" has no permission on purpose: it is the one screen a
 * plain member can use, and the server (not the menu) decides what a sign-in without a member
 * link may see.
 */
export const opsNav: NavItem[] = [
  { label: 'My account', path: '/me', icon: UserRound, group: 'overview', order: 5 },

  { label: 'Visitors', path: '/visitors', icon: UserPlus, group: 'people', permission: 'members:read', order: 50 },

  { label: 'Operations overview', path: '/operations', icon: Activity, group: 'operations', permission: 'members:read', order: 0, end: true },
  { label: "Children's check-in", path: '/checkin', icon: Baby, group: 'operations', permission: 'members:read', order: 10 },
  { label: 'Volunteers', path: '/volunteers', icon: Users2, group: 'operations', permission: 'members:read', order: 20 },
  { label: 'Facilities', path: '/facilities', icon: Building2, group: 'operations', permission: 'members:read', order: 30 },
  { label: 'Communications', path: '/comms', icon: MessageSquare, group: 'operations', permission: 'comms:send', order: 40 },
  { label: 'Pastoral care', path: '/care', icon: HeartPulse, group: 'operations', permission: 'care:read', order: 50 },

  { label: 'Import members', path: '/data/import', icon: Database, group: 'data', permission: 'members:write', order: 10 },
  { label: 'Exports', path: '/data/exports', icon: Database, group: 'data', permission: 'members:read', order: 20 },
  { label: 'Consent records', path: '/data/consents', icon: ShieldCheck, group: 'data', permission: 'members:read', order: 30 },
  { label: 'Subject access', path: '/data/subject-access', icon: ShieldCheck, group: 'data', permission: 'users:manage', order: 40 },
  { label: 'Erasure requests', path: '/data/erasure', icon: ShieldCheck, group: 'data', permission: 'users:manage', order: 50 },

  { label: 'Member sign-ins', path: '/account-links', icon: Link2, group: 'admin', permission: 'users:manage', order: 20 }
];

