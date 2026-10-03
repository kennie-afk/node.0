import { api, describeError } from "@/lib/api";
import { ksh, type Job, type Service, type Site, type SiteDetail } from "@/lib/types";
import { Badge, Card, EmptyState, Notice, PageHeader, buttonClass, dangerButtonClass, secondaryButtonClass } from "@/components/ui";
import { declareCash, moveJob } from "@/app/actions";
import { NewJobForm } from "./new-job-form";

interface Me {
  userId: string;
  siteId: string | null;
  role: string;
}

const OPEN = new Set(["created", "in_progress", "awaiting_payment", "paid"]);

/** The one action that moves a job to its next state, and the plain words for where it is now. */
const NEXT: Record<string, { type: string; label: string; hint: string } | undefined> = {
  created: { type: "started", label: "Start washing", hint: "Waiting to start" },
  in_progress: { type: "work_finished", label: "Finished washing", hint: "Being washed" },
  paid: { type: "closed", label: "Close job", hint: "Paid" }
};

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: actionError } = await searchParams;
  let error: string | null = actionError ?? null;
  let jobs: Job[] = [];
  let services: Service[] = [];
  let sites: Site[] = [];
  let bays: { id: string; label: string }[] = [];

  try {
    const me = await api.get<Me>("/v1/me");
    [services, sites] = await Promise.all([api.get<Service[]>("/v1/services"), api.get<Site[]>("/v1/sites")]);
    const siteId = me.siteId ?? (sites.length === 1 ? sites[0]!.id : "");
    jobs = (await api.get<Job[]>(`/v1/jobs${siteId ? `?siteId=${siteId}` : ""}`)).filter((job) => OPEN.has(job.state));
    if (siteId) bays = (await api.get<SiteDetail>(`/v1/sites/${siteId}`)).bays;
    services = services.filter((service) => service.active);
    if (me.siteId) sites = sites.filter((site) => site.id === me.siteId);
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <PageHeader
        title="Work"
        subtitle="Record each car as it arrives and move it along. This is the record Forecourt checks the money against, so every car goes in."
      />

      {error ? (
        <div className="mb-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="New job">
          {services.length === 0 ? (
            <p className="text-[0.8125rem] text-[var(--color-muted)]">No services are set up yet. Ask the owner to add them under Prices.</p>
          ) : (
            <NewJobForm services={services} bays={bays} sites={sites} />
          )}
        </Card>

        <Card title="Open jobs" description="Newest first.">
          {jobs.length === 0 ? (
            <EmptyState message="No open jobs" detail="Jobs you record appear here until they are closed." />
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {jobs.map((job) => {
                const next = NEXT[job.state];
                return (
                  <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-mono text-[0.875rem] font-medium">{job.plate ?? "No plate"}</p>
                      <p className="mt-0.5 text-[0.75rem] text-[var(--color-muted)]">
                        {ksh(job.quotedCents)} · {job.state === "awaiting_payment" ? "Waiting for payment" : (next?.hint ?? job.state)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {job.state === "awaiting_payment" ? (
                        <form action={declareCash}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <button type="submit" className={buttonClass}>
                            Cash received
                          </button>
                        </form>
                      ) : null}
                      {next ? (
                        <form action={moveJob}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <input type="hidden" name="type" value={next.type} />
                          <button type="submit" className={buttonClass}>
                            {next.label}
                          </button>
                        </form>
                      ) : null}
                      {job.state !== "paid" ? (
                        <form action={moveJob}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <input type="hidden" name="type" value="abandoned" />
                          <button type="submit" className={secondaryButtonClass} title="The customer left before paying">
                            Customer left
                          </button>
                        </form>
                      ) : (
                        <Badge value="paid" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <p className="mt-4 text-[0.75rem] text-[var(--color-faint)]">
        M-Pesa payments match to the job by plate and amount on their own. If a customer pays cash, press Cash received: it is checked
        against the water and the work, not taken on trust.
      </p>
    </>
  );
}
