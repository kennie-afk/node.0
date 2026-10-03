import type { ReactNode } from "react";

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
};

export type IconName =
  | "home"
  | "flags"
  | "jobs"
  | "payments"
  | "telemetry"
  | "sites"
  | "report"
  | "services"
  | "team"
  | "devices"
  | "start"
  | "billing";

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    home: (
      <>
        <path d="M4 10.5 12 4l8 6.5" />
        <path d="M6 10v9h12v-9" />
      </>
    ),
    flags: (
      <>
        <path d="M12 3.5 5 6.5v5c0 4.3 2.9 7.9 7 9 4.1-1.1 7-4.7 7-9v-5z" />
        <path d="M12 9v3.5M12 15.5v.5" />
      </>
    ),
    jobs: (
      <>
        <path d="M4 15h16" />
        <path d="M6 15c0-3.5 2-6 6-6s6 2.5 6 6" />
        <circle cx="8" cy="17.5" r="1.6" />
        <circle cx="16" cy="17.5" r="1.6" />
      </>
    ),
    payments: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 14.5h3" />
      </>
    ),
    telemetry: (
      <>
        <path d="M12 4c3 3.5 5 6.2 5 8.6A5 5 0 0 1 7 12.6C7 10.2 9 7.5 12 4z" />
      </>
    ),
    sites: (
      <>
        <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.4" />
      </>
    ),
    services: (
      <>
        <path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5z" />
        <path d="M4 7.5 12 11l8-3.5M12 11v9" />
      </>
    ),
    team: (
      <>
        <circle cx="9" cy="9" r="3" />
        <path d="M3.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5" />
        <path d="M16 6.5a2.6 2.6 0 0 1 0 5M17.5 14.3c1.8.6 2.7 2.2 3 4.7" />
      </>
    ),
    devices: (
      <>
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
      </>
    ),
    start: (
      <>
        <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
        <path d="m8.5 9 1.6 1.6L13 7.7M8.5 15.5h7" />
      </>
    ),
    billing: (
      <>
        <rect x="3.5" y="6" width="17" height="12" rx="2" />
        <path d="M3.5 10h17M7 14.5h3" />
      </>
    ),
    report: (
      <>
        <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
        <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
      </>
    )
  };

  return (
    <svg {...base} className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
