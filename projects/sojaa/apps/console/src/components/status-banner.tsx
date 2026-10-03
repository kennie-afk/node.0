import Link from "next/link";
import { api } from "@/lib/api";
import type { Billing, Onboarding } from "@/lib/types";
import { Notice } from "@/components/ui";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** One calm line at the top of every page for what must not be missed: that the figures are sample data, and where the subscription stands. */
export async function StatusBanner({ role }: { role: string }) {
  const [billing, onboarding] = await Promise.all([
    role === "owner" ? api.get<Billing>("/v1/billing").catch(() => null) : Promise.resolve(null),
    api.get<Onboarding>("/v1/onboarding").catch(() => null)
  ]);
  const notices: React.ReactNode[] = [];
  if (onboarding?.isSample) notices.push(<Notice key="sample" tone="warn">This is a <strong>sample firm</strong> with made-up guards, sites and invoices. It is never billed. Sign up for your own to enter real records.</Notice>);
  if (billing) {
    if (billing.status === "suspended") notices.push(<Notice key="b" tone="danger">This account is <strong>read-only</strong> until the subscription is paid. Your records are safe. <Link href="/console/billing" className="underline">Pay now</Link></Notice>);
    else if (billing.status === "past_due") notices.push(<Notice key="b" tone="warn">Your subscription is overdue. Pay by {day(billing.suspendsAt)} to keep making changes. <Link href="/console/billing" className="underline">See how to pay</Link></Notice>);
    else if (billing.status === "trial" && billing.daysLeft <= 7) notices.push(<Notice key="b" tone="info">Your free trial ends in {billing.daysLeft} day{billing.daysLeft === 1 ? "" : "s"}. <Link href="/console/billing" className="underline">Billing</Link></Notice>);
  }
  if (notices.length === 0) return null;
  return <div className="mb-5 flex flex-col gap-2">{notices}</div>;
}
