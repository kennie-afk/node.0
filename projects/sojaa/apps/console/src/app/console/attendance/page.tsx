import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { bq } from "@/lib/branch";
import { can } from "@/lib/roles";
import { clock, localToday } from "@/lib/format";
import { link, pageOf, sp, type SearchParams } from "@/lib/query";
import type { Board, Site } from "@/lib/types";
import { checkShift, overrideAttendance } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, Download, EmptyState, Field, PageHeader, Paging, Stat, Table, cell, inputClass, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";

const STATES = ["missed", "no_checkout", "late", "awaiting", "on_site", "upcoming", "completed", "open"];

export default async function Attendance({ searchParams }: { searchParams: SearchParams }) {
  const q = await sp(searchParams);
  const session = (await readSession())!;
  const day = q.day || localToday();
  const page = pageOf(q);
  const [board, sites] = await Promise.all([
    api.get<Board>(`/v1/attendance/board?day=${day}&page=${page}&pageSize=40${q.siteId ? `&siteId=${q.siteId}` : ""}${q.state ? `&state=${q.state}` : ""}${await bq("&")}`),
    api.get<{ items: Site[] }>(`/v1/sites?pageSize=100&active=true${await bq("&")}`)
  ]);
  const c = board.counts;
  const record = can(session.role, "attendance_record");
  return (
    <>
      <PageHeader title="Attendance" subtitle="Server-stamped check-ins against the roster. Worst first: missed shifts, then late arrivals." actions={<Download href={`/files/exports/attendance.csv?from=${day}&to=${day}`}>Download the day</Download>} />
      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        <Field label="Day"><input type="date" name="day" defaultValue={day} className={inputClass} /></Field>
        <Field label="Site"><select name="siteId" defaultValue={q.siteId ?? ""} className={selectClass}><option value="">All sites</option>{sites.items.map((s) => <option key={s.id} value={s.id}>{s.client} · {s.name}</option>)}</select></Field>
        <Field label="Show"><select name="state" defaultValue={q.state ?? ""} className={selectClass}><option value="">Everything</option>{STATES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></Field>
        <button className={secondaryButtonClass} type="submit">Show</button>
      </form>
      <div className="mb-4 grid grid-cols-3 gap-3 md:grid-cols-6">
        <Stat label="Shifts" value={String(c.total ?? 0)} tone="accent" />
        <Stat label="On site" value={String(c.on_site ?? 0)} tone="accent" />
        <Stat label="Done" value={String(c.completed ?? 0)} tone="good" />
        <Stat label="Missed" value={String((c.missed ?? 0) + (c.no_checkout ?? 0))} tone={(c.missed ?? 0) + (c.no_checkout ?? 0) ? "danger" : "good"} />
        <Stat label="Late" value={String(c.late ?? 0)} tone={c.late ? "warn" : "good"} />
        <Stat label="Open" value={String(c.open ?? 0)} tone={c.open ? "warn" : "good"} />
      </div>
      <Card>
        {board.items.length === 0 ? <EmptyState message="No shifts match." detail="Build the day on the roster page." /> : (
          <Table head={["Time", "Site and post", "Guard", "State", "In", "Out", "Where", "", ""]}>
            {board.items.map((r) => (
              <tr key={r.shiftId} className={rowClass} data-state={r.state}>
                <td className={cell}>{clock(r.startAt)}–{clock(r.endAt)}</td>
                <td className={cell}><div className="font-medium">{r.site}</div><div className="text-[0.6875rem] text-[var(--color-faint)]">{r.client} · {r.post}</div></td>
                <td className={cell}>{r.guard ? <>{r.guard}<div className="text-[0.6875rem] text-[var(--color-faint)]">{r.guardNo}</div></> : <span className="text-[var(--color-warn)]">Nobody assigned</span>}</td>
                <td className={cell}><Badge value={r.state} />{r.late ? <span className="ml-1"><Badge value="late" /></span> : null}{r.late ? <span className="ml-1 text-[0.6875rem] text-[var(--color-muted)]">{r.lateMinutes} min</span> : null}</td>
                <td className={cell}>{clock(r.inAt)}{r.inOverridden ? <span title="corrected by a supervisor" className="ml-1 text-[var(--color-warn)]">*</span> : null}</td>
                <td className={cell}>{clock(r.outAt)}{r.outOverridden ? <span title="corrected by a supervisor" className="ml-1 text-[var(--color-warn)]">*</span> : null}</td>
                <td className={cell}>{r.geofence ? <Badge value={r.geofence} /> : "–"}</td>
                <td className={cell}>
                  {record && r.guardId && !r.inAt ? <ActionForm action={checkShift} submit="Check in" button={secondaryButtonClass}><input type="hidden" name="shiftId" value={r.shiftId} /><input type="hidden" name="kind" value="in" /></ActionForm> : null}
                  {record && r.guardId && r.inAt && !r.outAt ? <ActionForm action={checkShift} submit="Check out" button={secondaryButtonClass}><input type="hidden" name="shiftId" value={r.shiftId} /><input type="hidden" name="kind" value="out" /></ActionForm> : null}
                </td>
                <td className={cell}>
                  {can(session.role, "attendance_override") && r.guardId ? (
                    <details><summary className="cursor-pointer text-[0.75rem] text-[var(--color-accent)]">Correct</summary>
                      <ActionForm action={overrideAttendance} submit="Record the correction" className="mt-2 flex w-64 flex-col gap-2">
                        <input type="hidden" name="shiftId" value={r.shiftId} />
                        <select name="kind" className={selectClass}><option value="in">Check-in time</option><option value="out">Check-out time</option></select>
                        <input type="datetime-local" name="when" required className={inputClass} />
                        <input name="reason" required minLength={5} placeholder="Why (kept on record)" className={inputClass} />
                      </ActionForm>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Paging page={board.page} pageSize={board.pageSize} total={board.total} href={(p) => link("/console/attendance", q, { page: p })} />
      <p className="mt-3 text-[0.6875rem] text-[var(--color-faint)]">A * marks a time a supervisor corrected; the original event is kept. Times are Kenyan time, stamped by the server. A guard checked in away from the site is flagged here, never blocked.</p>
    </>
  );
}
