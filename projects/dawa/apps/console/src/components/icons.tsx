import type { ReactNode } from "react";

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export type IconName =
  | "home" | "sell" | "products" | "stock" | "receive" | "sales" | "dispensing" | "controlled" | "stocktake" | "close"
  | "payables" | "customers" | "reports" | "trace" | "team" | "branches" | "billing" | "start" | "orders" | "batches" | "mpesa" | "prices";

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    home: (<><path d="M4 10.5 12 4l8 6.5" /><path d="M6 10v9h12v-9" /></>),
    sell: (<><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /><path d="M3.5 5h2.2l1.9 9.2h9.3l1.6-6.7H7" /></>),
    products: (<><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M5 9.5h14M12 9.5v11" /></>),
    stock: (<><path d="M3.5 8 12 4l8.5 4v8L12 20l-8.5-4z" /><path d="M3.5 8 12 12l8.5-4M12 12v8" /></>),
    receive: (<><path d="M4 14v5h16v-5" /><path d="M12 4v10M8 10.5l4 4 4-4" /></>),
    sales: (<><path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8z" /><path d="M9 8.5h6M9 12h6" /></>),
    dispensing: (<><rect x="4.5" y="4" width="15" height="16.5" rx="2.5" /><path d="M12 8v6M9 11h6" /></>),
    controlled: (<><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2" /></>),
    stocktake: (<><path d="M5 5.5h14M5 12h14M5 18.5h14" /><path d="m3 5.5.8.8 1.5-1.6" /></>),
    close: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
    payables: (<><rect x="3.5" y="6" width="17" height="12" rx="2.5" /><path d="M3.5 10h17M7 14.5h3" /></>),
    customers: (<><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.5-3 2.6-4.5 5.5-4.5s5 1.5 5.5 4.5" /><path d="M16.5 6.5a2.8 2.8 0 0 1 0 5M18 14.8c1.4.6 2.2 1.9 2.5 4" /></>),
    reports: (<><path d="M4.5 19.5h15" /><path d="M7 16v-4M12 16V7M17 16v-6" /></>),
    trace: (<><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4" /><circle cx="12" cy="12" r="3.2" /></>),
    team: (<><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19.5c.6-3.3 3-5 6.5-5s5.9 1.7 6.5 5" /></>),
    branches: (<><path d="M4 19.5v-11l8-4.5 8 4.5v11" /><path d="M9.5 19.5v-5h5v5" /></>),
    billing: (<><rect x="3.5" y="6" width="17" height="12" rx="2.5" /><path d="M3.5 10.5h17" /></>),
    start: (<><path d="M5 20V4M5 5h11l-2 3.5L16 12H5" /></>),
    orders: (<><path d="M6 3.5h12v17H6z" /><path d="M9 8h6M9 12h6M9 16h3" /></>),
    batches: (<><rect x="4" y="4" width="16" height="6" rx="1.5" /><rect x="4" y="14" width="16" height="6" rx="1.5" /><path d="M8 7h3M8 17h3" /></>),
    mpesa: (<><rect x="7" y="3.5" width="10" height="17" rx="2.5" /><path d="M10.5 17.5h3M12 7v6M9.5 10h5" /></>),
    prices: (<><path d="M4 12.5 12.5 4H20v7.5L11.5 20z" /><circle cx="15.5" cy="8.5" r="1.2" /></>)
  };
  return (
    <svg {...base} className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
