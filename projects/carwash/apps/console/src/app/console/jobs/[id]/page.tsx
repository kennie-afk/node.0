import Link from "next/link";
import { api, describeError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { VoidForm } from "@/components/forms";
import { ksh, type JobDetail } from "@/lib/types";
import { Badge, Card, KeyValue, Notice, PageHeader, Table, rowClass, secondaryButtonClass } from "@/components/ui";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();
  let job: JobDetail | null = null;
  let error: string | null = null;
  try {
    job = await api.get<JobDetail>(`/v1/jobs/${id}`);
  } catch (caught) {
    error = describeError(caught);
  }
  if (!job) {
    return (
      <>
        <PageHeader title="Job" />
        <Notice tone="danger">{error}</Notice>
      </>
    );
  }
  const undercharged = job.quotedCents < job.listCents;
  const canVoid = ["supervisor", "manager", "owner"].includes(session?.role ?? "") && ["paid", "closed"].includes(job.state);

  return (
    <>
      <PageHeader
        title={job.plate ?? "Job"}
        subtitle={`${job.site}${job.bay ? ` · ${job.bay}` : ""} · worker ${job.worker ?? "unknown"}`}
        actions={
          <Link href="/console/jobs" className={secondaryButtonClass}>
            All jobs
          </Link>
        }
      />
      {undercharged && !job.discountAuthorised ? (
        <div className="mb-4">
          <Notice tone="danger">
            Quoted {ksh(job.quotedCents)} against a list price of {ksh(job.listCents)}, with no manager&apos;s authorisation on record.
          </Notice>
        </div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="The job">
          <div className="space-y-4 px-5 pb-5">
            <Badge value={job.state} />
            <KeyValue
              items={[
                ["Quoted", ksh(job.quotedCents)],
                ["List price", ksh(job.listCents)],
                ["Opened", new Date(job.createdAt).toLocaleString()],
                ["Closed", job.closedAt ? new Date(job.closedAt).toLocaleString() : "—"]
              ]}
            />
            <Table head={["Service", "Price"]}>
              {job.services.map((service) => (
                <tr key={service.name} className={rowClass}>
                  <td className="px-3.5 py-2 text-[0.8125rem]">{service.name}</td>
                  <td className="px-3.5 py-2 text-[0.8125rem] tabular-nums">{ksh(service.unitPriceCents)}</td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
        <div className="space-y-5">
          <Card title="Payments">
            <div className="px-5 pb-5">
              {job.payments.length === 0 ? (
                <p className="text-[0.8125rem] text-[var(--color-muted)]">No payment has reached this job.</p>
              ) : (
                <Table head={["Channel", "Amount", "Reference", "Received"]}>
                  {job.payments.map((payment) => (
                    <tr key={payment.id} className={rowClass}>
                      <td className="px-3.5 py-2 text-[0.8125rem] capitalize">{payment.channel}</td>
                      <td className="px-3.5 py-2 text-[0.8125rem] tabular-nums">
                        {ksh(payment.amountCents)}
                        {payment.reversed ? <span className="ml-2 text-[0.6875rem] font-medium text-[var(--color-warn)]">refunded</span> : null}
                      </td>
                      <td className="px-3.5 py-2 font-mono text-[0.75rem] text-[var(--color-muted)]">{payment.reference ?? "—"}</td>
                      <td className="px-3.5 py-2 text-[0.75rem] text-[var(--color-faint)]">{new Date(payment.receivedAt).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
          </Card>
          {canVoid ? (
            <Card title="Refund or void">
              <VoidForm id={job.id} />
            </Card>
          ) : null}
          <Card title="Timeline" description="Server-stamped; the phone's clock is never trusted.">
            <ol className="space-y-2 px-5 pb-5">
              {job.events.map((event, index) => (
                <li key={index} className="flex items-center justify-between gap-3 text-[0.8125rem]">
                  <span>
                    {event.type.replace("job.", "").replaceAll("_", " ")}
                    {typeof event.payload.reason === "string" ? <span className="ml-2 text-[0.75rem] text-[var(--color-muted)]">“{event.payload.reason}”</span> : null}
                    {typeof event.payload.declaredCents === "number" && event.payload.declaredCents !== event.payload.quotedCents ? (
                      <span className="ml-2 text-[0.75rem] text-[var(--color-warn)]">
                        declared {ksh(event.payload.declaredCents)} against {ksh(Number(event.payload.quotedCents))}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[0.75rem] tabular-nums text-[var(--color-faint)]">{new Date(event.at).toLocaleTimeString()}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
