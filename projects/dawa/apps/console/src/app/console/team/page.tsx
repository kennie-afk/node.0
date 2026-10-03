import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { addPerson, changePin, resetPersonPin, setPersonStatus } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { Branch, Person } from "@/lib/types";
import { Badge, Card, Field, PageHeader, Table, dangerButtonClass, inputClass, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";

export default async function Team() {
  const session = await readSession();
  const [people, branches] = await Promise.all([api.get<Person[]>("/v1/team"), api.get<Branch[]>("/v1/branches")]);
  const owner = session?.role === "owner";
  const real = branches.filter((b) => !b.isSample);
  return (
    <>
      <PageHeader title="Team" subtitle="Give everyone their own phone and PIN, so every sale and every controlled-drug entry has a name on it." />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title={`${people.length} people`}>
          <Table head={["Name", "Role", "Branch", "Status", ""]}>
            {people.map((p) => (
              <tr key={p.id} className={rowClass}>
                <td className="px-3.5 py-2.5"><div className="font-medium">{p.displayName}</div><div className="text-[0.6875rem] text-[var(--color-faint)]">{p.phone}{p.licenceNo ? ` · ${p.licenceNo}` : ""}</div></td>
                <td className="px-3.5 py-2.5 capitalize">{p.role}</td>
                <td className="px-3.5 py-2.5 text-[var(--color-muted)]">{p.branch ?? "All"}</td>
                <td className="px-3.5 py-2.5"><Badge value={p.status} /></td>
                <td className="px-3.5 py-2.5">{p.role !== "owner" && p.id !== undefined ? (
                  <div className="flex gap-2">
                    <ActionForm action={resetPersonPin} submit="New PIN" button={secondaryButtonClass} className="flex flex-col gap-1"><input type="hidden" name="id" value={p.id} /></ActionForm>
                    <ActionForm action={setPersonStatus} submit={p.status === "active" ? "Remove access" : "Restore"} button={p.status === "active" ? dangerButtonClass : secondaryButtonClass} className="flex flex-col gap-1"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={p.status === "active" ? "disabled" : "active"} /></ActionForm>
                  </div>) : null}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <div className="flex flex-col gap-5">
          <Card title="Add a person" description="Their PIN is shown once, here, and stored only as a hash.">
            <ActionForm action={addPerson} submit="Add person">
              <Field label="Name"><input name="displayName" required className={inputClass} /></Field>
              <Field label="Phone"><input name="phone" required className={inputClass} placeholder="0712 345 678" /></Field>
              <Field label="Role"><select name="role" className={selectClass} defaultValue="cashier">{owner ? <option value="manager">Manager</option> : null}<option value="pharmacist">Pharmacist</option><option value="cashier">Cashier</option></select></Field>
              <Field label="Licence number" hint="For a pharmacist: printed on their dispensing records."><input name="licenceNo" className={inputClass} /></Field>
              {owner && real.length > 1 ? <Field label="Branch"><select name="branchId" className={selectClass}>{real.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field> : null}
            </ActionForm>
          </Card>
          <Card title="Change my PIN">
            <ActionForm action={changePin} submit="Change PIN"><Field label="Current PIN"><input name="currentPin" type="password" inputMode="numeric" required className={inputClass} /></Field><Field label="New PIN (6 digits)"><input name="newPin" type="password" inputMode="numeric" maxLength={6} required className={inputClass} /></Field><Field label="Repeat"><input name="confirm" type="password" inputMode="numeric" maxLength={6} required className={inputClass} /></Field></ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
