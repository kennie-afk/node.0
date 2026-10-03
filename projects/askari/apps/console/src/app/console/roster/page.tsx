import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { bq } from "@/lib/branch";
import { can } from "@/lib/roles";
import { clock, localToday, WEEKDAYS } from "@/lib/format";
import { link, sp, type SearchParams } from "@/lib/query";
import type { Page, PostPick, Shift, Swap, Template } from "@/lib/types";
import { addShift, addTemplate, assignGuard, bulkShifts, cancelShift, decideSwap, publishRoster, requestSwap } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, EmptyState, Field, PageHeader, Paging, Table, Tabs, cell, inputClass, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";

const ADD = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (d: string) => ADD(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

export default async function RosterPage({ searchParams }: { searchParams: SearchParams }) {
  const q = await sp(searchParams);
  const session = (await readSession())!;
  const write = can(session.role, "roster_write");
  const tab = q.tab === "swaps" ? "swaps" : "week";
  const tabs = [{ href: "/console/roster", label: "Week" }, { href: "/console/roster?tab=swaps", label: "Swaps" }];
  const bqs = await bq("&");

  if (tab === "swaps") {
    const page = Math.max(1, Number(q.page) || 1);
    const swaps = await api.get<Page<Swap>>(`/v1/swaps?page=${page}&pageSize=25`);
    return (
      <>
        <PageHeader title="Shift swaps" subtitle="A guard asks to hand a shift to someone else. A different person approves; the roster only changes on approval." />
        <Tabs items={tabs} active="/console/roster?tab=swaps" />
        <Card>
          {swaps.items.length === 0 ? <EmptyState message="No swap requests." /> : (
            <Table head={["Shift", "From", "To", "Why", "Status", ""]}>
              {swaps.items.map((s) => (
                <tr key={s.id} className={rowClass}>
                  <td className={cell}>{new Date(s.startAt).toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi" })} {clock(s.startAt)}–{clock(s.endAt)}<div className="text-[0.6875rem] text-[var(--color-faint)]">{s.site} · {s.post}</div></td>
                  <td className={cell}>{s.fromGuard}</td><td className={cell}>{s.toGuard}</td>
                  <td className={cell}>{s.reason ?? "–"}<div className="text-[0.6875rem] text-[var(--color-faint)]">asked by {s.requestedBy}</div></td>
                  <td className={cell}><Badge value={s.status} /></td>
                  <td className={cell}>
                    {s.status === "pending" && can(session.role, "swap_approve") ? (
                      <div className="flex gap-2">
                        <ActionForm action={decideSwap} submit="Approve" button={secondaryButtonClass}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="decision" value="approve" /></ActionForm>
                        <ActionForm action={decideSwap} submit="Reject" button={secondaryButtonClass}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="decision" value="reject" /></ActionForm>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Paging page={swaps.page} pageSize={swaps.pageSize} total={swaps.total} href={(p) => link("/console/roster", q, { page: p })} />
      </>
    );
  }

  const week = mondayOf(q.week || localToday());
  const [shifts, posts, templates] = await Promise.all([
    api.get<Page<Shift>>(`/v1/shifts?from=${week}&to=${ADD(week, 6)}&pageSize=500${q.siteId ? `&siteId=${q.siteId}` : ""}${bqs}`),
    api.get<Page<PostPick>>(`/v1/posts?pageSize=200`),
    api.get<Template[]>("/v1/shift-templates")
  ]);
  const rows = new Map<string, { label: string; sub: string; byDay: Map<string, Shift[]> }>();
  for (const s of shifts.items) {
    const r = rows.get(s.postId) ?? { label: s.site, sub: `${s.client} · ${s.post}`, byDay: new Map() };
    r.byDay.set(s.day, [...(r.byDay.get(s.day) ?? []), s]);
    rows.set(s.postId, r);
  }
  const days = Array.from({ length: 7 }, (_, i) => ADD(week, i));
  const open = shifts.items.filter((s) => !s.guardId).length;
  return (
    <>
      <PageHeader title="Roster" subtitle="Who is on which post. A guard cannot be put on two overlapping shifts." actions={write ? (
        <ActionForm action={publishRoster} submit="Publish this week" className="flex gap-2" button={secondaryButtonClass}><input type="hidden" name="from" value={week} /><input type="hidden" name="to" value={ADD(week, 6)} /></ActionForm>
      ) : undefined} />
      <Tabs items={tabs} active="/console/roster" />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.8125rem]">
        <a className={secondaryButtonClass} href={link("/console/roster", q, { week: ADD(week, -7) })}>← Previous week</a>
        <strong>{week} to {ADD(week, 6)}</strong>
        <a className={secondaryButtonClass} href={link("/console/roster", q, { week: ADD(week, 7) })}>Next week →</a>
        <span className="text-[var(--color-muted)]">{shifts.total} shifts, {open} open</span>
      </div>
      <Card>
        {rows.size === 0 ? <EmptyState message="No shifts this week." detail="Add one below, or create a run from a shift pattern." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-[0.75rem]"><thead><tr className="border-b border-[var(--color-line)] text-left"><th className="px-3 py-2">Post</th>{days.map((d, i) => <th key={d} className="px-3 py-2 font-medium">{WEEKDAYS[(i + 1) % 7]!.slice(0, 3)} {d.slice(5)}</th>)}</tr></thead>
            <tbody>
              {[...rows.entries()].map(([id, r]) => (
                <tr key={id} className="border-b border-[var(--color-line)] align-top last:border-0">
                  <td className="px-3 py-2"><div className="font-medium">{r.label}</div><div className="text-[0.6875rem] text-[var(--color-faint)]">{r.sub}</div></td>
                  {days.map((d) => (
                    <td key={d} className="px-2 py-2">
                      {(r.byDay.get(d) ?? []).map((s) => (
                        <div key={s.id} className="mb-1.5 rounded-md border border-[var(--color-line)] p-1.5" data-shift={s.id}>
                          <div className="flex items-center justify-between gap-1"><span>{clock(s.startAt)}–{clock(s.endAt)}</span>{s.published ? null : <span className="text-[0.625rem] text-[var(--color-faint)]">draft</span>}</div>
                          <div className={s.guard ? "font-medium" : "font-medium text-[var(--color-warn)]"}>{s.guard ?? "OPEN"}</div>
                          {write ? (
                            <details><summary className="cursor-pointer text-[0.6875rem] text-[var(--color-accent)]">Change</summary>
                              <ActionForm action={assignGuard} submit="Set guard" className="mt-1 flex flex-col gap-1"><input type="hidden" name="shiftId" value={s.id} /><input name="guard" placeholder="Guard no. or name (blank = open)" className={inputClass} /></ActionForm>
                              {s.guardId ? <ActionForm action={requestSwap} submit="Ask for a swap" className="mt-1 flex flex-col gap-1"><input type="hidden" name="shiftId" value={s.id} /><input name="guard" required placeholder="Swap to (guard no.)" className={inputClass} /><input name="reason" placeholder="Why" className={inputClass} /></ActionForm> : null}
                              <ActionForm action={cancelShift} submit="Cancel shift" className="mt-1 flex flex-col gap-1"><input type="hidden" name="shiftId" value={s.id} /><input name="reason" required minLength={3} placeholder="Why cancelled" className={inputClass} /></ActionForm>
                            </details>
                          ) : null}
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody></table></div>
        )}
      </Card>
      {write ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Card title="Add one shift">
            <ActionForm action={addShift} submit="Add shift">
              <Field label="Post"><select name="postId" required className={selectClass}>{posts.items.map((p) => <option key={p.id} value={p.id}>{p.client} · {p.site} · {p.name}</option>)}</select></Field>
              <Field label="Pattern"><select name="templateId" required className={selectClass}>{templates.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
              <Field label="Date"><input type="date" name="date" defaultValue={week} required className={inputClass} /></Field>
              <Field label="Guard" hint="Number or name. Leave blank for an open shift."><input name="guard" className={inputClass} /></Field>
              <PostSite posts={posts.items} />
            </ActionForm>
          </Card>
          <Card title="Create a run" description="The same shift on many days. Days that clash are skipped and listed.">
            <ActionForm action={bulkShifts} submit="Create the run">
              <Field label="Post"><select name="postId" required className={selectClass}>{posts.items.map((p) => <option key={p.id} value={p.id}>{p.client} · {p.site} · {p.name}</option>)}</select></Field>
              <Field label="Pattern"><select name="templateId" required className={selectClass}>{templates.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="From"><input type="date" name="from" defaultValue={week} required className={inputClass} /></Field><Field label="To"><input type="date" name="to" defaultValue={ADD(week, 6)} required className={inputClass} /></Field></div>
              <Field label="Guard" hint="Optional."><input name="guard" className={inputClass} /></Field>
              <fieldset className="flex flex-wrap gap-2 text-[0.75rem]">{[1, 2, 3, 4, 5, 6, 0].map((d) => <label key={d} className="flex items-center gap-1"><input type="checkbox" name="weekdays" value={d} defaultChecked />{WEEKDAYS[d]!.slice(0, 3)}</label>)}</fieldset>
              <PostSite posts={posts.items} />
            </ActionForm>
          </Card>
          <Card title="Shift patterns" description="A name and clock times. Night shifts may cross midnight.">
            <ul className="mb-3 text-[0.8125rem]">{templates.map((t) => <li key={t.id} className="flex justify-between border-b border-[var(--color-line)] py-1.5"><span>{t.name}</span><span className="text-[var(--color-muted)]">{t.startTime}–{t.endTime} ({t.minutes / 60}h)</span></li>)}</ul>
            <ActionForm action={addTemplate} submit="Add pattern">
              <Field label="Name"><input name="name" required className={inputClass} placeholder="Evening 14:00-22:00" /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Start"><input type="time" name="startTime" required className={inputClass} /></Field><Field label="End"><input type="time" name="endTime" required className={inputClass} /></Field></div>
            </ActionForm>
          </Card>
        </div>
      ) : null}
    </>
  );
}

/** The shift needs its site as well as its post; the form carries the one that goes with the chosen post. */
function PostSite({ posts }: { posts: PostPick[] }) {
  return <PostSiteField map={Object.fromEntries(posts.map((p) => [p.id, p.siteId]))} />;
}
import { PostSiteField } from "@/components/post-site";
