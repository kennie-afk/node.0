import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import { clock, localToday } from "@/lib/format";
import type { Board } from "@/lib/types";
import { checkShift, scanCheckpoint } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { GeoFields } from "@/components/geo";
import { Badge, Card, EmptyState, PageHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

/** The supervisor's phone page: big buttons for the guards on shift now. The phone supplies a position; the server supplies the time. */
export default async function CheckPage() {
  const [awaiting, onSite] = await Promise.all([
    api.get<Board>(`/v1/attendance/board?day=${localToday()}&state=awaiting&pageSize=15${await bq("&")}`),
    api.get<Board>(`/v1/attendance/board?day=${localToday()}&state=on_site&pageSize=15${await bq("&")}`)
  ]);
  const missed = await api.get<Board>(`/v1/attendance/board?day=${localToday()}&state=missed&pageSize=15${await bq("&")}`);
  const todo = [...missed.items, ...awaiting.items];
  return (
    <>
      <PageHeader title="Check in" subtitle="For the supervisor, on a phone at the site. Allow location so a check-in away from the site can be flagged." />
      <div className="flex max-w-xl flex-col gap-4">
        <Card title="Waiting to check in">
          {todo.length === 0 ? <EmptyState message="Nobody is waiting." /> : (
            <ul className="flex flex-col gap-3">
              {todo.map((r) => (
                <li key={r.shiftId} className="rounded-lg border border-[var(--color-line)] p-3">
                  <div className="flex items-center justify-between gap-2"><div><div className="font-medium">{r.guard}</div><div className="text-[0.75rem] text-[var(--color-muted)]">{r.site} · {r.post} · from {clock(r.startAt)}</div></div><Badge value={r.state} /></div>
                  <ActionForm action={checkShift} submit={`Check in ${r.guard?.split(" ")[0] ?? ""}`} className="mt-2 flex flex-col gap-1" button={buttonClass}>
                    <input type="hidden" name="shiftId" value={r.shiftId} /><input type="hidden" name="kind" value="in" /><GeoFields />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="On site">
          {onSite.items.length === 0 ? <EmptyState message="Nobody is on site." /> : (
            <ul className="flex flex-col gap-3">
              {onSite.items.map((r) => (
                <li key={r.shiftId} className="rounded-lg border border-[var(--color-line)] p-3">
                  <div className="flex items-center justify-between gap-2"><div><div className="font-medium">{r.guard}</div><div className="text-[0.75rem] text-[var(--color-muted)]">{r.site} · in at {clock(r.inAt)}{r.late ? ` (late ${r.lateMinutes} min)` : ""}</div></div>{r.geofence ? <Badge value={r.geofence} /> : null}</div>
                  <ActionForm action={scanCheckpoint} submit="Scan checkpoint" className="mt-2 flex flex-col gap-1" button={secondaryButtonClass}>
                    <input type="hidden" name="shiftId" value={r.shiftId} />
                    <input name="token" required placeholder="Scan or paste the checkpoint code" className={inputClass} autoComplete="off" />
                    <GeoFields />
                  </ActionForm>
                  <ActionForm action={checkShift} submit={`Check out ${r.guard?.split(" ")[0] ?? ""}`} className="mt-2 flex flex-col gap-1" button={secondaryButtonClass}>
                    <input type="hidden" name="shiftId" value={r.shiftId} /><input type="hidden" name="kind" value="out" /><GeoFields />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <p className="text-[0.75rem] text-[var(--color-faint)]">Guards can also check themselves in at <code>/guard</code> with their phone number and PIN.</p>
      </div>
    </>
  );
}
