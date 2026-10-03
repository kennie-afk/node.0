"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { signOut } from "@/app/actions";

export interface RailItem {
  href: string;
  label: string;
  icon: IconName;
}

interface RailProps {
  items: RailItem[];
  displayName: string;
  role: string;
}

export function Rail({ items, displayName, role }: RailProps) {
  const pathname = usePathname();
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  return (
    <aside className="sticky top-0 hidden h-screen w-[84px] shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-rail)] md:flex">
      <div className="flex justify-center py-5">
        <Image src="/mark.svg" alt="Sojaa" width={256} height={256} className="h-7 w-7" priority />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5">
        {items.map((item) => {
          const active = item.href === "/console" ? pathname === "/console" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[0.625rem] font-medium transition-colors ${
                active
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-raised)] hover:text-[var(--color-ink)]"
              }`}
            >
              <Icon name={item.icon} className="h-[19px] w-[19px]" />
              <span className="text-center leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <form action={signOut} className="flex flex-col items-center gap-1 px-2 pb-5 pt-4">
        <span
          title={displayName}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)] text-[0.75rem] font-semibold text-white"
        >
          {initials}
        </span>
        <span className="text-[0.625rem] font-medium capitalize text-[var(--color-muted)]">{role}</span>
        <button
          type="submit"
          className="mt-1 rounded-md px-1.5 py-0.5 text-[0.625rem] font-medium text-[var(--color-faint)] transition-colors hover:bg-[var(--color-raised)] hover:text-[var(--color-ink)]"
        >
          Sign out
        </button>
      </form>
    </aside>
  );
}

/** The rail is hidden below the medium breakpoint, so a phone gets this: the same destinations and a way out. */
export function MobileBar({ items, displayName }: { items: RailItem[]; displayName: string }) {
  return (
    <div className="mb-5 flex items-center gap-2 overflow-x-auto border-b border-[var(--color-line)] pb-3 md:hidden">
      <Image src="/mark.svg" alt="Sojaa" width={256} height={256} className="h-6 w-6 shrink-0" />
      <nav className="flex flex-1 items-center gap-1">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="shrink-0 rounded-md px-2.5 py-1.5 text-[0.75rem] font-medium text-[var(--color-muted)]">
            {item.label}
          </Link>
        ))}
      </nav>
      <form action={signOut} className="shrink-0">
        <button type="submit" title={displayName} className="rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[0.75rem] font-medium">
          Sign out
        </button>
      </form>
    </div>
  );
}
