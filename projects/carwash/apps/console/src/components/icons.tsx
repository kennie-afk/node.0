import type { ReactNode } from "react";

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
};

export type IconName = "home" | "flags" | "jobs" | "payments" | "telemetry" | "sites" | "report";

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
