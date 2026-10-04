// Adds N balanced journal entries through the real API (so the ledger hash chain stays valid), spread over
// the current fiscal year. node post-journal.mjs <apiBase> <email> <password> [N=6000] [workers=6]
const [base, email, password, N = '6000', W = '6'] = process.argv.slice(2);
const j = { 'content-type': 'application/json', 'accept-encoding': 'gzip' };
const login = await (await fetch(base + '/auth/login', { method: 'POST', headers: j, body: JSON.stringify({ email, password }) })).json();
const auth = { ...j, authorization: `Bearer ${login.token}` };
const accounts = await (await fetch(base + '/finance/accounts', { headers: auth })).json();
const funds = await (await fetch(base + '/finance/funds', { headers: auth })).json();
const cash = accounts.find((a) => a.systemKey === 'BANK_MAIN').id;
const income = accounts.find((a) => a.systemKey === 'INCOME_TITHES').id;
const fund = funds[0].id;
const run = Date.now().toString(36);
const now = new Date(); const day0 = Date.UTC(now.getUTCFullYear(), 0, 1); const span = Math.max(1, Math.floor((now.getTime() - day0) / 86400000));
let next = 0, ok = 0, bad = 0; const t0 = Date.now();
async function worker(w) {
  for (;;) {
    const i = next++; if (i >= Number(N)) return;
    const date = new Date(day0 + (i % span) * 86400000).toISOString().slice(0, 10);
    const amount = (1 + ((i * 7) % 900) + (i % 100) / 100).toFixed(2);
    const r = await fetch(base + '/finance/journal', { method: 'POST', headers: { ...auth, 'Idempotency-Key': `bulk-${run}-${i}` }, body: JSON.stringify({ date, memo: `bulk entry ${i}`, lines: [{ accountId: cash, fundId: fund, debit: amount }, { accountId: income, fundId: fund, credit: amount }] }) });
    if (r.status === 201) ok++; else { bad++; if (bad < 4) console.log('failed', r.status, (await r.text()).slice(0, 160)); }
    if ((ok + bad) % 1000 === 0) console.log(`${ok + bad}/${N} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}
await Promise.all(Array.from({ length: Number(W) }, (_, w) => worker(w)));
console.log(`posted ${ok}, failed ${bad}, ${((Date.now() - t0) / 1000).toFixed(0)}s (${(ok / ((Date.now() - t0) / 1000)).toFixed(1)} entries/s)`);
