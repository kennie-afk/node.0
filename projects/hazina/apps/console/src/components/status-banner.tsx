import Link from "next/link";
import { api } from "@/lib/api";
import type { Billing, Onboarding } from "@/lib/types";
import { Notice } from "@/components/ui";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * One calm line at the top of every console page for the two things an owner must never miss: that
 * the figures on screen are sample data, and where the subscription stands. Silent when neither applies.
 */
export async function StatusBanner({ role }: { role: string }) {
  const manager = role === "owner" || role === "manager";
  const [billing, onboarding] = await Promise.all([
    manager ? api.get<Billing>("/v1/billing").catch(() => null) : Promise.resolve(null),
    api.get<Onboarding>("/v1/onboarding").catch(() => null)
  ]);

  const notices: React.ReactNode[] = [];

  if (onboarding?.isSample) {
    notices.push(
      <Notice key="sample" tone="warn">
        This is a <strong>sample organisation</strong> with made-up members and loans. It is never billed. Sign up for your own to enter real records.
      </Notice>
    );
  }

  if (billing) {
    if (billing.status === "suspended") {
      notices.push(
        <Notice key="billing" tone="danger">
          This account is <strong>read-only</strong> until the subscription is paid. Your records are safe and still being
          collected.{" "}
          <Link href="/console/billing" className="underline">
            Pay now
          </Link>
        </Notice>
      );
    } else if (billing.status === "past_due") {
      notices.push(
        <Notice key="billing" tone="warn">
          Your subscription is overdue. Pay by {day(billing.suspendsAt)} to keep
          making changes.{" "}
          <Link href="/console/billing" className="underline">
            See how to pay
          </Link>
        </Notice>
      );
    } else if (billing.status === "trial" && billing.daysLeft <= 7) {
      notices.push(
        <Notice key="billing" tone="info">
          Your free trial ends in {billing.daysLeft} day{billing.daysLeft === 1 ? "" : "s"}.{" "}
          <Link href="/console/billing" className="underline">
            Billing
          </Link>
        </Notice>
      );
    }
  }

  if (notices.length === 0) return null;
  return <div className="mb-5 flex flex-col gap-2">{notices}</div>;
}
