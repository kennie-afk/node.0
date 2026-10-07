import type { ReactNode } from "react";

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export type IconName = "home" | "attendance" | "roster" | "guards" | "sites" | "patrol" | "incidents" | "payroll" | "invoices" | "debtors" | "team" | "branches" | "settings" | "billing" | "start" | "audit";

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    audit: (<><rect x="5" y="3.5" width="14" height="17" rx="2.2" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>),
    home: (<><path d="M4 10.5 12 4l8 6.5" /><path d="M6 10v9h12v-9" /></>),
    attendance: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
    roster: (<><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M9 3.5v3M15 3.5v3" /></>),
    guards: (<><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.5-3 2.6-4.5 5.5-4.5s5 1.5 5.5 4.5" /><path d="M16.5 6.5a2.8 2.8 0 0 1 0 5M18 14.8c1.4.6 2.2 1.9 2.5 4" /></>),
    sites: (<><path d="M12 21s6-5.3 6-10.2A6 6 0 0 0 6 10.8C6 15.7 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.2" /></>),
    patrol: (<><path d="M4 19.5 9 6l4 8 3-5 4 10.5" /><circle cx="9" cy="6" r="1.2" /></>),
    incidents: (<><path d="M12 4 3.5 19.5h17z" /><path d="M12 10v4.5M12 17.2v.1" /></>),
    payroll: (<><rect x="3.5" y="6" width="17" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M7 9.5v.1M17 14.5v.1" /></>),
    invoices: (<><path d="M6.5 3.5h8l3 3v14h-11z" /><path d="M14 3.5v3.5h3.5M9.5 12.5h5M9.5 16h5" /></>),
    debtors: (<><path d="M5 19.5h14" /><path d="M7 16.5v-6M12 16.5v-9M17 16.5v-4" /></>),
    team: (<><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19.5c.6-3.3 3-5 6.5-5s5.9 1.7 6.5 5" /></>),
    branches: (<><path d="M4 19.5v-11l8-4.5 8 4.5v11" /><path d="M9.5 19.5v-5h5v5" /></>),
    settings: (<><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2 18 18M18 6l-1.8 1.8M7.8 16.2 6 18" /></>),
    billing: (<><rect x="3.5" y="6" width="17" height="12" rx="2.5" /><path d="M3.5 10.5h17" /></>),
    start: (<><path d="M5 20V4M5 5h11l-2 3.5L16 12H5" /></>)
  };
  return (
    <svg {...base} className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
