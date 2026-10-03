import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import { Card, EmptyState, PageHeader, Stat, Table, rowClass } from "@/components/ui";
import { day, ksh } from "@/lib/format";

interface SalesReport { from: string; to: string; salesCount: number; netCents: number; byMethod: Record<string, number>; perDay: { day: string; sales: number; voids: number; netCents: number }[] }
interface MarginReport { revenueCents: number; costCents: number; marginCents: number; marginPct: number | null; items: { productId: string; name: string; units: number; revenueCents: number; marginCents: number; marginPct: number | null }[] }
interface Movers { days: number; fast: { productId: string; name: string; sold: number; onHand: number; daysOfCover: number | null }[]; slow: { productId: string; name: string; sold: number; onHand: number; daysOfCover: number | null }[]; dead: { productId: string; name: string; onHand: number; stockValueCents: number }[] }
interface Loss { writtenOffCents: number; writtenOffUnits: number; expiredOnShelfCents: number; expiredOnShelfUnits: number; valuation: { inDateCents: number; expiredCents: number } }

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  const q = await bq();
  const range = [from ? `from=${from}` : "", to ? `to=${to}` : ""].filter(Boolean).join("&");
  const join = q ? "&" : "?";
  const tail = range ? `${join}${range}` : "";
  const [sales, margin, movers, loss] = await Promise.all([
    api.get<SalesReport>(`/v1/reports/sales${q}${tail}`),
    api.get<MarginReport>(`/v1/reports/margin${q}${tail}`),
    api.get<Movers>(`/v1/reports/movers${q}`),
    api.get<Loss>(`/v1/reports/expiry-loss${q}${tail}`)
  ]);
  return (
    <>
      <PageHeader title="Reports" subtitle={`${day(sales.from)} to ${day(sales.to)}. Net of returns and voids, from the same records the till writes.`} actions={
        <form className="flex gap-2"><input type="date" name="from" defaultValue={from} className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]" /><input type="date" name="to" defaultValue={to} className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[0.8125rem]" /><button className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[0.8125rem] font-medium hover:bg-[var(--color-raised)]">Show</button></form>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Net sales" value={ksh(sales.netCents)} hint={`${sales.salesCount} sales`} tone="accent" />
        <Stat label="Margin" value={margin.marginPct === null ? "—" : `${margin.marginPct}%`} hint={`${ksh(margin.marginCents)} on cost ${ksh(margin.costCents)}`} tone="good" />
        <Stat label="Stock at cost" value={ksh(loss.valuation.inDateCents)} hint="in date" tone="accent" />
        <Stat label="Expired on shelf" value={ksh(loss.expiredOnShelfCents)} hint={`${loss.expiredOnShelfUnits} units · written off ${ksh(loss.writtenOffCents)}`} tone={loss.expiredOnShelfCents ? "danger" : "good"} />
      </div>
      <div className="mt-5">
        <Card title="Take your records out" description="Plain spreadsheets (CSV) of your own data. They are yours to keep, whatever happens to your subscription.">
          <div className="flex flex-wrap gap-4 text-[0.8125rem] font-medium text-[var(--color-accent)]">
            <a href="/console/export/sales" className="underline">Sales, line by line</a>
            <a href="/console/export/stock" className="underline">Stock by batch</a>
            <a href="/console/export/controlled" className="underline">Controlled-drug register</a>
            <a href="/console/dispensing/export" className="underline">Dispensing log</a>
            <a href="/console/trace/export" className="underline">Trace log</a>
          </div>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="By day">
          {sales.perDay.length === 0 ? <EmptyState message="No sales in this period." /> : <Table head={["Day", "Sales", "Net"]}>{sales.perDay.map((d) => <tr key={d.day} className={rowClass}><td className="px-3.5 py-2.5">{day(d.day)}</td><td className="px-3.5 py-2.5 tabular-nums">{d.sales}{d.voids ? ` (+${d.voids} voided)` : ""}</td><td className="px-3.5 py-2.5 tabular-nums">{ksh(d.netCents)}</td></tr>)}</Table>}
        </Card>
        <Card title="Margin by product" description="Revenue after returns and discounts, less what the batches actually cost.">
          {margin.items.length === 0 ? <EmptyState message="Nothing sold." /> : <Table head={["Product", "Units", "Revenue", "Margin"]}>{margin.items.slice(0, 15).map((i) => <tr key={i.productId} className={rowClass}><td className="px-3.5 py-2.5">{i.name}</td><td className="px-3.5 py-2.5 tabular-nums">{i.units}</td><td className="px-3.5 py-2.5 tabular-nums">{ksh(i.revenueCents)}</td><td className="px-3.5 py-2.5 tabular-nums">{i.marginPct === null ? "—" : `${i.marginPct}%`}</td></tr>)}</Table>}
        </Card>
        <Card title={`Fast movers (last ${movers.days} days)`}>
          {movers.fast.length === 0 ? <EmptyState message="No sales yet." /> : <Table head={["Product", "Sold", "On hand", "Lasts"]}>{movers.fast.slice(0, 10).map((m) => <tr key={m.productId} className={rowClass}><td className="px-3.5 py-2.5">{m.name}</td><td className="px-3.5 py-2.5 tabular-nums">{m.sold}</td><td className="px-3.5 py-2.5 tabular-nums">{m.onHand}</td><td className="px-3.5 py-2.5 tabular-nums">{m.daysOfCover === null ? "—" : `${m.daysOfCover} days`}</td></tr>)}</Table>}
        </Card>
        <Card title="Stock that is not selling" description="On the shelf, with no sales in the period: money tied up that may expire.">
          {movers.dead.length === 0 ? <EmptyState message="Everything on the shelf has sold." /> : <Table head={["Product", "On hand", "Tied up at cost"]}>{movers.dead.slice(0, 10).map((m) => <tr key={m.productId} className={rowClass}><td className="px-3.5 py-2.5">{m.name}</td><td className="px-3.5 py-2.5 tabular-nums">{m.onHand}</td><td className="px-3.5 py-2.5 tabular-nums">{ksh(m.stockValueCents)}</td></tr>)}</Table>}
        </Card>
      </div>
    </>
  );
}
