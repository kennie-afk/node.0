import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can, ROLE_LABEL } from "@/lib/roles";
import type { Branch, Person } from "@/lib/types";
import { addBranch, addPerson, changePin, resetPersonPin, setPersonStatus } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, Field, PageHeader, Table, dangerButtonClass, inputClass, rowClass, cell, secondaryButtonClass, selectClass } from "@/components/ui";

export default async function Team() {
  const session = (await readSession())!;
  const write = can(session.role, "team_write");
  // listing people needs team_write; everyone else still gets this page, for changing their own PIN
  const [people, branches] = await Promise.all([write ? api.get<Person[]>("/v1/team") : Promise.resolve([] as Person[]), api.get<Branch[]>("/v1/branches")]);
  const owner = session.role === "owner";
  const real = branches.filter((b) => !b.isSample);
  return (
    <>
      <PageHeader title="Team" subtitle="Everyone who signs in to the console gets their own phone and PIN, so every correction, approval and payroll step has a name on it." />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {write ? (<Card title={`${people.length} people`}>
          <Table head={["Name", "Role", "Branch", "Status", ""]}>{people.map((p) => (
            <tr key={p.id} className={rowClass}>
              <td className={cell}><div className="font-medium">{p.displayName}</div><div className="text-[0.6875rem] text-[var(--color-faint)]">{p.phone}</div></td>
              <td className={cell}>{ROLE_LABEL[p.role] ?? p.role}</td><td className={`${cell} text-[var(--color-muted)]`}>{p.branch ?? "All"}</td><td className={cell}><Badge value={p.status} /></td>
              <td className={cell}>{write && p.role !== "owner" ? <div className="flex gap-2"><ActionForm action={resetPersonPin} submit="New PIN" button={secondaryButtonClass}><input type="hidden" name="id" value={p.id} /></ActionForm><ActionForm action={setPersonStatus} submit={p.status === "active" ? "Remove access" : "Restore"} button={p.status === "active" ? dangerButtonClass : secondaryButtonClass}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={p.status === "active" ? "disabled" : "active"} /></ActionForm></div> : null}</td>
            </tr>
          ))}</Table>
        </Card>) : (<Card title="Your account"><p className="text-[0.8125rem] text-[var(--color-muted)]">Only the owner and operations managers can see the team. You can change your own PIN here.</p></Card>)}
        <div className="flex flex-col gap-5">
          {write ? (
            <Card title="Add a person" description="Their PIN is shown once, here, and stored only as a hash.">
              <ActionForm action={addPerson} submit="Add person">
                <Field label="Name"><input name="displayName" required className={inputClass} /></Field>
                <Field label="Phone"><input name="phone" required className={inputClass} placeholder="0712 345 678" /></Field>
                <Field label="Role"><select name="role" className={selectClass} defaultValue="supervisor"><option value="supervisor">Supervisor (one branch, sees no wages)</option>{owner ? <><option value="ops_manager">Operations manager</option><option value="payroll">Payroll</option><option value="auditor">Auditor (read only)</option></> : null}</select></Field>
                {real.length > 1 ? <Field label="Branch" hint="A supervisor needs one."><select name="branchId" className={selectClass}><option value="">All branches</option>{real.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field> : null}
              </ActionForm>
            </Card>
          ) : null}
          {owner ? (
            <Card title="Branches" description="Depots or regions. A supervisor sees only their own.">
              <ul className="mb-3 text-[0.8125rem]">{real.map((b) => <li key={b.id} className="border-b border-[var(--color-line)] py-1.5">{b.name} <span className="text-[var(--color-faint)]">{b.code}</span></li>)}</ul>
              <ActionForm action={addBranch} submit="Add branch"><Field label="Name"><input name="name" required minLength={2} className={inputClass} placeholder="Mombasa depot" /></Field></ActionForm>
            </Card>
          ) : null}
          <Card title="Change my PIN"><ActionForm action={changePin} submit="Change PIN"><Field label="Current PIN"><input name="currentPin" type="password" inputMode="numeric" required className={inputClass} /></Field><Field label="New PIN (6 digits)"><input name="newPin" type="password" inputMode="numeric" maxLength={6} required className={inputClass} /></Field><Field label="Repeat"><input name="confirm" type="password" inputMode="numeric" maxLength={6} required className={inputClass} /></Field></ActionForm></Card>
        </div>
      </div>
    </>
  );
}
