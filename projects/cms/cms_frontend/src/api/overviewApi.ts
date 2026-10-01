import { http } from './http';

export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  href: string;
}

/** Each section is present only when the signed-in role may see it. */
export interface Overview {
  asOf: string;
  people?: {
    members: { total: number; joinedLast30Days: number; joinedPrevious30Days: number };
    recentMembers: Array<{ id: number; name: string; joinedAt: string }>;
    upcomingEvents: Array<{ id: number; name: string; location: string | null; startsAt: string }>;
  };
  giving?: {
    thisMonth: string;
    lastMonth: string;
    gifts: number;
    trend: Array<{ month: string; gifts: number; donors: number; total: string }>;
    recent: Array<{ id: number; date: string; amount: string; receiptNo: string | null; type: string; donor: string }>;
  };
  finance?: {
    cash: string;
    month: { income: string; expenses: string; surplus: string };
    yearToDate: { income: string; expenses: string; surplus: string };
    bills: { outstanding: string; overdue: string; dueNext7Days: string; overdueCount: number } | null;
    accountsPayable: string | null;
  };
  attention: AttentionItem[];
}

export const getOverview = () => http.get<Overview>('/overview');
