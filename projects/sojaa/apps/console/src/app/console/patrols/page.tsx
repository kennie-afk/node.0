import { api } from "@/lib/api";
import { localToday } from "@/lib/format";
import { sp, type SearchParams } from "@/lib/query";
import type { PatrolDay } from "@/lib/types";
import { Badge, Card, EmptyState, Field, PageHeader, Table, cell, inputClass, rowClass, secondaryButtonClass } from "@/components/ui";

export default async function PatrolsPage({ searchParams }: { searchParams: SearchParams }) {
  const q = await sp(searchParams);
  const day = q.day || localToday();
  const rows = await api.get<PatrolDay[]>(`/v1/patrol/day?day=${day}`);
  const short = rows.filter((r) => r.shortfall > 0).length;
  return (
    <>
      <PageHeader title="Patrols" subtitle="For sites that require rounds: how many full rounds of QR checkpoints each shift completed. A round is one visit to every checkpoint." />
      <form className="mb-4 flex items-end gap-3" method="get"><Field label="Day"><input type="date" name="day" defaultValue={day} className={inputClass} /></Field><button className={secondaryButtonClass} type="submit">Show</button></form>
      <Card title={`${rows.length} shift(s) with required rounds, ${short} short`}>
        {rows.length === 0 ? <EmptyState message="No shift on this day has patrol rounds required." detail="Set rounds per shift and add checkpoints on a site page." /> : (
          <Table head={["Site", "Post", "Guard", "Rounds done", "Required", "Outside the site", ""]}>{rows.map((r) => (
            <tr key={r.shiftId} className={rowClass}><td className={cell}>{r.site}</td><td className={cell}>{r.post}</td><td className={cell}>{r.guard ?? "–"}</td><td className={`${cell} tabular-nums`}>{r.completeRounds}</td><td className={`${cell} tabular-nums`}>{r.roundsRequired}</td><td className={cell}>{r.outsideGeofence ? <Badge value="outside" /> : "–"}</td><td className={cell}>{r.shortfall > 0 ? <Badge value="missed" /> : <Badge value="completed" />}</td></tr>
          ))}</Table>
        )}
      </Card>
    </>
  );
}
