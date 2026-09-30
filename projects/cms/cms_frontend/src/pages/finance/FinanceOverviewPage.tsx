import { Link } from 'react-router-dom';
import { Button, Card, DataTable, formatMoney, LineChart, monthLabel, PageHeader, StatTile, StatusPill, toMinor, useQuery, Donut } from '../../ui';
import { getDashboard } from '../../api/reportsApi';
import { Money } from '../../features/finance/components/common';
import { useAuth } from '../../context/auth-context';

const shortMonth = (ym: string) => `${monthLabel(Number(ym.slice(5, 7))).slice(0, 3)} ${ym.slice(2, 4)}`;
const major = (amount: string) => toMinor(amount) / 100;

export default function FinanceOverviewPage() {
  const { can } = useAuth();
  const { data, error, loading, refetch } = useQuery(() => getDashboard(), []);

  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title="Finance overview"
        subtitle={data ? `${data.fiscalYear.name} · as of ${data.asOf}` : 'Income, cash, bills and budget at a glance'}
        actions={
          <div className="ui-row">
            {can('giving:write') && (
              <Button to="/giving/contributions/new" variant="primary" size="sm">
                Record a gift
              </Button>
            )}
            {can('finance:post') && (
              <Button to="/finance/journal/new" size="sm">
                New journal entry
              </Button>
            )}
          </div>
        }
      />

      {error && !data && (
        <Card>
          <p className="fin-warn" role="alert">
            {error.message} <Button size="sm" variant="ghost" onClick={refetch}>Retry</Button>
          </p>
        </Card>
      )}
      {loading && !data && <Card>Loading the figures…</Card>}

      {data && (
        <>
          <div className="ui-grid" style={{ ['--ui-min' as string]: '170px' }}>
            <StatTile label="Income this month" value={formatMoney(data.month.income)} foot={`since ${data.month.from}`} />
            <StatTile label="Spending this month" value={formatMoney(data.month.expenses)} />
            <StatTile label="Surplus this month" value={formatMoney(data.month.surplus)} tone={data.month.surplus.startsWith('-') ? 'bad' : 'ok'} />
            <StatTile label="Cash and bank" value={formatMoney(data.cash.total)} foot={`${data.cash.accounts.length} accounts`} />
            <StatTile label="Income this year" value={formatMoney(data.yearToDate.income)} foot={`since ${data.yearToDate.from}`} />
            <StatTile label="Spending this year" value={formatMoney(data.yearToDate.expenses)} />
            <StatTile label="Surplus this year" value={formatMoney(data.yearToDate.surplus)} tone={data.yearToDate.surplus.startsWith('-') ? 'bad' : 'ok'} />
            {data.bills && (
              <StatTile
                label="Bills overdue"
                value={formatMoney(data.bills.overdue)}
                tone={data.bills.overdueCount > 0 ? 'warn' : 'ok'}
                foot={`${data.bills.overdueCount} overdue · ${formatMoney(data.bills.dueNext7Days)} due in 7 days`}
              />
            )}
          </div>

          <div className="ui-grid" style={{ ['--ui-min' as string]: '320px' }}>
            <Card title="Giving, last 12 months" subtitle="Posted gifts by month">
              {data.givingTrend.length > 0 ? (
                <LineChart
                  area
                  label="Giving by month for the last twelve months"
                  labels={data.givingTrend.map((m) => shortMonth(m.month))}
                  series={[{ name: 'Giving', values: data.givingTrend.map((m) => major(m.total)) }]}
                  format={(n) => formatMoney(n.toFixed(2))}
                />
              ) : (
                <p className="fin-muted">No gifts recorded yet.</p>
              )}
            </Card>

            <Card title="Where the cash is" actions={<Link to="/banking/accounts">Accounts</Link>} flush>
              <DataTable
                rowKey={(r) => r.accountId}
                rows={data.cash.accounts}
                columns={[
                  { key: 'name', header: 'Account', render: (r) => `${r.code} · ${r.name}` },
                  { key: 'balance', header: 'Balance', numeric: true, render: (r) => <Money value={r.balance} /> }
                ]}
                empty={<span>No cash accounts have a balance yet.</span>}
              />
              {data.cash.accounts.length > 1 && (
                <div style={{ padding: 12 }}>
                  <Donut
                    label="Share of cash by account"
                    slices={data.cash.accounts.map((a) => ({ label: a.name, value: major(a.balance) }))}
                    format={(n) => formatMoney(n.toFixed(2))}
                  />
                </div>
              )}
            </Card>
          </div>

          <div className="ui-grid" style={{ ['--ui-min' as string]: '320px' }}>
            {data.pledges && (
              <Card title="Pledges" actions={<Link to="/giving/pledges">All pledges</Link>}>
                <p>
                  {data.pledges.activePledges} active · pledged <Money value={data.pledges.pledged} /> · received <Money value={data.pledges.received} /> · outstanding <Money value={data.pledges.outstanding} />
                </p>
                {data.pledges.campaigns.map((c) => (
                  <div key={c.id} style={{ marginTop: 8 }}>
                    <div className="ui-row" style={{ justifyContent: 'space-between' }}>
                      <Link to={`/giving/campaigns/${c.id}`}>{c.name}</Link>
                      <span className="ui-num">{c.percent}% of <Money value={c.goal} /></span>
                    </div>
                    <div className="fin-progress" role="img" aria-label={`${c.percent} percent of goal`}>
                      <span style={{ width: `${Math.min(100, Number(c.percent))}%` }} />
                    </div>
                  </div>
                ))}
              </Card>
            )}
            {data.budget && (
              <Card title="Budget" subtitle={data.budget.name} actions={<Link to="/budgets">Budgets</Link>}>
                <p>
                  Spent <Money value={data.budget.actualExpensesToDate} /> of <Money value={data.budget.budgetedExpensesToDate} /> budgeted to date{' '}
                  {data.budget.utilisation && <StatusPill status={`${data.budget.utilisation}% used`} tone={Number(data.budget.utilisation) > 100 ? 'bad' : 'ok'} />}
                </p>
                <div className={`fin-progress ${Number(data.budget.utilisation) > 100 ? 'bad' : ''}`} role="img" aria-label={`${data.budget.utilisation ?? 0} percent of budget used`}>
                  <span style={{ width: `${Math.min(100, Number(data.budget.utilisation ?? 0))}%` }} />
                </div>
              </Card>
            )}
            {data.accountsPayable && (
              <Card title="Payables" actions={<Link to="/payables/bills">Bills</Link>}>
                <p>
                  Owed to suppliers <Money value={data.accountsPayable} />
                </p>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
