import { Link } from 'react-router-dom';
import { AlertCircle, HandCoins, Landmark, Users } from 'lucide-react';
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, LineChart, PageHeader, PageLoader, StatTile, formatDate, formatDateShort, formatDateTime, formatMoney, monthLabel, toMinor, useQuery } from '../../ui';
import { getOverview } from '../../api/overviewApi';
import { useAuth } from '../../context/auth-context';

const shortMonth = (ym: string) => `${monthLabel(Number(ym.slice(5, 7))).slice(0, 3)} ${ym.slice(2, 4)}`;
const major = (amount: string) => toMinor(amount) / 100;

/** Percent change from the earlier figure to the later, or null when there is nothing to compare with. */
const change = (now: number, before: number): number | null => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

export default function DashboardPage() {
  const { can, roleLabel, email } = useAuth();
  const { data, error, refetch } = useQuery(() => getOverview(), []);

  if (error && !data) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!data) return <PageLoader />;

  const { people, giving, finance, attention } = data;
  const empty = !people && !giving && !finance;
  const name = (email ?? '').split('@')[0];

  const trend = giving?.trend ?? [];
  const members = people?.members;

  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title="Dashboard"
        subtitle={`${formatDate(data.asOf)} · ${name ? `${name}, ` : ''}${roleLabel}`}
        actions={
          <div className="ui-row">
            {can('giving:write') && <Button to="/giving/contributions/new" variant="primary" size="sm">Record a gift</Button>}
            {can('members:write') && <Button to="/members" size="sm">Add a member</Button>}
            {can('finance:post') && <Button to="/finance/journal/new" size="sm">New journal entry</Button>}
          </div>
        }
      />

      {empty && (
        <Card>
          <EmptyState title="Welcome" message="Your role does not include any church-wide figures. Your own details, giving and events are under My account." />
          <div style={{ paddingTop: 4 }}><Button to="/me" variant="primary" size="sm">Open my account</Button></div>
        </Card>
      )}

      {!empty && (
        <div className="dash-tiles">
          {members && (
            <StatTile
              icon={<Users size={15} />}
              label="Members"
              value={members.total}
              delta={change(members.joinedLast30Days, members.joinedPrevious30Days)}
              foot={`${members.joinedLast30Days} joined in the last 30 days`}
            />
          )}
          {giving && (
            <StatTile
              icon={<HandCoins size={15} />}
              label="Giving this month"
              value={formatMoney(giving.thisMonth)}
              delta={change(toMinor(giving.thisMonth), toMinor(giving.lastMonth))}
              foot={`${giving.gifts} ${giving.gifts === 1 ? 'gift' : 'gifts'} · was ${formatMoney(giving.lastMonth)}`}
            />
          )}
          {finance && <StatTile icon={<Landmark size={15} />} label="Cash and bank" value={formatMoney(finance.cash)} foot={`Surplus this month ${formatMoney(finance.month.surplus)}`} />}
          {finance?.bills && (
            <StatTile
              icon={<AlertCircle size={15} />}
              label="Bills overdue"
              value={formatMoney(finance.bills.overdue)}
              tone={finance.bills.overdueCount > 0 ? 'warn' : 'ok'}
              foot={`${finance.bills.overdueCount} overdue · ${formatMoney(finance.bills.dueNext7Days)} due in 7 days`}
            />
          )}
        </div>
      )}

      {!empty && (
        <div className="dash-two">
          <Card title="Needs attention" subtitle="What is waiting on someone in your role">
            {attention.length === 0 ? (
              <p className="dash-muted">Nothing is waiting. Everything you can act on is up to date.</p>
            ) : (
              <ul className="dash-list">
                {attention.map((item) => (
                  <li key={item.key}>
                    <Link to={item.href}>{item.label}</Link>
                    <Badge tone="warn">{item.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {giving && (
            <Card title="Giving, last 6 months" subtitle="Posted gifts by month" actions={can('giving:read') ? <Link to="/giving/contributions">All gifts</Link> : undefined}>
              {trend.length > 0 ? (
                <LineChart
                  area
                  label="Giving by month for the last six months"
                  labels={trend.map((m) => shortMonth(m.month))}
                  series={[{ name: 'Giving', values: trend.map((m) => major(m.total)) }]}
                  format={(n) => formatMoney(n.toFixed(2))}
                />
              ) : (
                <p className="dash-muted">No gifts recorded yet.</p>
              )}
            </Card>
          )}
        </div>
      )}

      {!empty && (
        <div className="dash-three">
          {giving && (
            <Card title="Recent gifts" actions={<Link to="/giving/contributions">View all</Link>} flush>
              <DataTable
                rowKey={(g) => g.id}
                rows={giving.recent}
                columns={[
                  { key: 'donor', header: 'Donor', render: (g) => <Link to={`/giving/contributions/${g.id}`}>{g.donor}</Link> },
                  { key: 'type', header: 'Type', render: (g) => g.type },
                  { key: 'date', header: 'Date', render: (g) => formatDateShort(g.date) },
                  { key: 'amount', header: 'Amount', numeric: true, render: (g) => formatMoney(g.amount) }
                ]}
                empty={<span>No gifts yet.</span>}
              />
            </Card>
          )}

          {people && (
            <Card title="Coming up" actions={<Link to="/events">Events</Link>}>
              {people.upcomingEvents.length === 0 ? (
                <p className="dash-muted">No events are scheduled.</p>
              ) : (
                <ul className="dash-list">
                  {people.upcomingEvents.map((e) => (
                    <li key={e.id} className="dash-stack">
                      <strong>{e.name}</strong>
                      <span className="dash-muted">{formatDateTime(e.startsAt)}{e.location ? ` · ${e.location}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {people && (
            <Card title="New members" actions={<Link to="/members">Members</Link>}>
              {people.recentMembers.length === 0 ? (
                <p className="dash-muted">No members yet.</p>
              ) : (
                <ul className="dash-list">
                  {people.recentMembers.map((m) => (
                    <li key={m.id}>
                      <Link to={`/members`}>{m.name}</Link>
                      <span className="dash-muted">{formatDateShort(m.joinedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
