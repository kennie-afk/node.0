# Church CMS on one free server

This folder runs the whole Church CMS (website, API, database, background jobs) on **one small server that you
rent for nothing**, with automatic HTTPS, nightly backups and a restore you have actually rehearsed.

It replaces the Render free-tier setup in `../../render.yaml`. That one sleeps when nobody is using it and takes a
minute or more to wake up, its free database expires, and it cannot run background jobs. Your current live API
(`church-cms-backend.onrender.com`) is in exactly that state: it does not answer.

## What you get, in plain words

| | |
|---|---|
| Cost | **KES 0** for the server (Oracle Cloud "Always Free"), the HTTPS certificates (Let's Encrypt via Caddy) and the optional CDN/DNS (Cloudflare free). A domain name costs money; you can skip it (see step 3). |
| Always on | Nothing sleeps. A restart of just the API is serving again in about **2 seconds**; the whole stack from stopped to serving is about **10 seconds**. |
| Fast | See "How fast, measured" below. Short version: a page of members in ~20 ms, the dashboard in ~40 ms, reports in under 10 ms once warm, measured with 50,000 members and 500,000 gifts in one church. |
| Safe | HTTPS everywhere (HTTP/3 too), every church's data separated inside the database itself, the database and cache are not reachable from the internet, secrets are generated for you and never printed. |
| Recoverable | `scripts/backup.sh` every night; `scripts/restore.sh --drill` proves a backup works; restoring onto a brand-new empty server was tested end to end (see "What was tested"). |

## Honest limits (read these before relying on it)

1. **One server is one point of failure.** If the machine dies or Oracle takes it back, the service is down until you
   restore from a backup onto a new one (about 10 minutes of work, 35 seconds of restoring). Backups only help if you
   copy them **off** the server: see step 8. A free bucket (Cloudflare R2 or Backblaze B2) holds them.
2. **Oracle's free tier has conditions and they can change.** At the time of writing (I could not re-check Oracle's
   site today, so verify on <https://www.oracle.com/cloud/free/>): you must give a credit or debit card to prove you are a
   person (it is not charged while you stay inside the Always Free limits); the free ARM machine ("Ampere A1") can be
   **out of capacity** in a region (try again later, another availability domain, or ask for a smaller size); and Oracle
   has a policy of **reclaiming Always Free machines that sit idle** for a week. Upgrading the account to
   "Pay As You Go" (still free within the same limits) is the usual way to stay out of that policy. Check the current
   rules before you depend on it.
3. **Distance matters more than anything here.** The nearest Oracle regions to Nairobi are Johannesburg and Frankfurt.
   Typical round-trip times from Kenya are on the order of tens of milliseconds to Johannesburg and about 150 ms to
   Frankfurt (typical figures, not measured by me): every page makes several requests, so pick Johannesburg if you can,
   and measure with `ping` and from a phone on Safaricom before you decide. A CDN in front (step 5) removes the
   distance for the static files but not for data.
4. **M-Pesa and SMS are in mock mode.** Nothing here talks to Safaricom or an SMS provider. Going live needs
   credentials from them, a public HTTPS callback (this setup gives you one) and testing with real small amounts.
5. **Nobody has run this on a real Oracle machine yet.** Everything was built and tested on a laptop with Docker, with
   the production configuration. See "What I could not verify".

## Before you start

You need: an Oracle Cloud account; an SSH key (`ssh-keygen -t ed25519` if you have none); and this folder's source on
your computer. Optional: a domain name (about USD 10 a year) and a free Cloudflare account.

## Steps

### 1. Create the server (Oracle Cloud, about 15 minutes)

1. Sign up at <https://cloud.oracle.com>. Choose your **home region** carefully: Always Free resources only work in it
   (pick Johannesburg or Frankfurt).
2. Compute > Instances > Create instance. Image: **Ubuntu 24.04** (or 22.04). Shape: **VM.Standard.A1.Flex** with
   **2 OCPU and 12 GB** (the free allowance is up to 4 OCPU / 24 GB in total; a smaller request is easier to get). If A1
   is out of capacity, try again in an hour, another availability domain, or the AMD `VM.Standard.E2.1.Micro` (1 GB RAM:
   too small for the database and the build; use it only to test).
3. Networking: keep the default VCN with a public IP. Add your SSH public key. Boot volume 100 GB (the free total is
   200 GB).
4. After it starts, open the ports. In the VCN's **Security List** add ingress rules from `0.0.0.0/0` for **TCP 80,
   TCP 443 and UDP 443** (SSH, TCP 22, is there already). UDP 443 is for HTTP/3.
5. Note the **public IP**.

### 2. Copy the files to the server

From the `projects/cms` folder on your computer:

```bash
./deploy/single-vm/scripts/deploy.sh ubuntu@<server-ip> --key ~/.ssh/id_ed25519 --copy-only
```

### 3. Prepare the server (once)

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@<server-ip>
cd ~/cms/deploy/single-vm
chmod +x scripts/*.sh
sudo ./scripts/first-run.sh        # installs Docker, opens only 22/80/443, automatic security updates, swap if small
exit && ssh ... again              # so your user is allowed to use Docker
```

**Choose how people will reach the site.** You need a hostname that points at the server.
* **With a domain** (best): in Cloudflare (free) add a domain, then an `A` record `cms` -> the server's IP.
* **Without a domain** (free, works today): use `<ip-with-dashes>.sslip.io`, for example `203-0-113-10.sslip.io` for
  `203.0.113.10`. It resolves to that IP automatically and Caddy can get a real certificate for it.

### 4. Configure and start

```bash
cd ~/cms/deploy/single-vm
./scripts/generate-env.sh --site cms.example.com --email you@example.com
./scripts/up.sh
```

`generate-env.sh` writes `.env` (mode 600) with strong random secrets and tunes Postgres to this machine's memory. It
refuses to run twice, because new secrets would lock you out of the existing database. **Copy `.env` somewhere safe and
private** (a password manager): a backup is useless to a new server without the database passwords in it.

`up.sh` builds the images (first time: several minutes), starts everything, waits until it is healthy and runs a smoke
test. Then create your church (there is no public sign-up screen; the console is for existing churches):

```bash
./scripts/create-church.sh "Grace Chapel Nairobi" grace-nairobi you@yourchurch.org
```

Open `https://cms.example.com` and sign in with that email and password.

### 5. Optional: put Cloudflare in front (free)

In Cloudflare DNS turn the orange cloud **on** for the record. Set SSL/TLS mode to **Full (strict)**. Then tell the
server to believe Cloudflare about who is visiting (otherwise every visitor looks like Cloudflare and shares one rate
limit): re-run setup on a **fresh** install with `--cloudflare`, or on an existing one edit `.env` and set
`TRUSTED_PROXIES` to Cloudflare's published ranges (the list is in `scripts/generate-env.sh`; check it against
<https://www.cloudflare.com/ips/>), then `./scripts/up.sh --no-build`.
Benefit: static files come from Cloudflare's edge near your users, and attacks are absorbed there. Cost: HTTP/3 to the
browser is Cloudflare's, not the server's.

### 6. If you want the console to stay on Vercel instead

Same-origin (everything on this server) is faster and simpler, but if you prefer Vercel for the website files:

```bash
# on the server
./scripts/generate-env.sh --site api.example.com --email you@example.com --api-only --console-origin https://church-cms-seven.vercel.app
./scripts/up.sh
# on your computer, in projects/cms/cms_frontend (the folder is already linked to your Vercel project)
printf 'https://api.example.com' | npx vercel env add VITE_API_URL production
npx vercel deploy --prod
```

`VITE_API_URL` is baked into the website at build time, so it must be set **before** deploying. `CORS_ORIGINS` must list
the exact address people use (the generator sets it from `--console-origin`; Vercel preview addresses are not allowed).
Sign-in uses a token in the request header, not a cookie, so no cookie or domain settings are involved.

### 7. Look after it

| To... | Run (on the server, in `~/cms/deploy/single-vm`) |
|---|---|
| Update after you changed code | on your computer `./scripts/deploy.sh ubuntu@<ip>` (copies, rebuilds, migrates, smoke-tests) |
| See what is happening | `docker compose -p cms -f docker-compose.prod.yml logs -f --tail 100 api` (also `caddy`, `worker`, `postgres`) |
| Check health | `./scripts/smoke-test.sh` |
| Slow queries | `docker compose -p cms -f docker-compose.prod.yml exec postgres psql -U cms -c "select calls, mean_exec_time, left(query,80) from pg_stat_statements order by total_exec_time desc limit 10"` |
| Change a secret | `./scripts/rotate-secrets.sh jwt` (signs everyone out) or `appdb` (no impact) |

### 8. Backups (do this on day one)

```bash
sudo ./scripts/install-backup-timer.sh     # nightly at 02:30 UTC, keeps 7 daily + 4 weekly on the server
./scripts/backup.sh                         # take one now
./scripts/restore.sh --drill backups/daily/<newest>.dump    # prove it restores; do this monthly
```

These stay on the same machine, so also copy them off it. With a free bucket (Cloudflare R2 has a free allowance;
Backblaze B2 too; check current limits): install `rclone`, run `rclone config` to add the bucket, then put
`RCLONE_REMOTE=r2:your-bucket-name` in `.env`; `backup.sh` then copies each new dump there.

**Disaster recovery** (the server is gone): create a new server (steps 1-3), copy your saved `.env` into
`~/cms/deploy/single-vm/`, start only the database (`docker compose -p cms -f docker-compose.prod.yml --env-file .env up -d postgres`),
fetch a dump from the bucket, then `./scripts/restore.sh --live <dump> --yes`. Point DNS at the new IP.

## How fast, measured

Measured on my laptop, **not** on the production hardware: an Intel Core i5-3320M from 2012 (4 threads) shared with
everything else I was running, 11.6 GB RAM, Docker, the real production stack from `docker-compose.prod.yml`, load
generated on the same machine. An Oracle Ampere A1 core is considerably faster than that CPU, so treat these as a
pessimistic floor, not a promise. Data: one church with **50,000 members, 500,000 gifts and 6,000 ledger entries**
(roughly ten times a large real church; most churches are 10-100 times smaller).

### API: before and after my changes

Same data, same machine, same stack. "32 clients" = 32 simultaneous requests hammering one endpoint for 8 seconds
(a stress test: queueing dominates the percentiles, so read it as capacity). "One user" = one request at a time (what
a person actually feels). Times in milliseconds; p99 is the slowest 1 request in 100.

| Endpoint | 32 clients BEFORE: req/s, median, p99 | 32 clients AFTER: req/s, median, p99 | One user AFTER: median |
|---|---|---|---|
| Dashboard (`/overview`) | 10, 1,911, 6,039 | **40**, **709**, 1,725 | **42** |
| Members, page 1 | 26, 1,181, 1,518 | **89**, **337**, 932 | **18** |
| Members, page 1,500 (deep) | 13, 2,199, 2,723 | **39**, **779**, 1,053 | **54** |
| Members, search "wanj" | 6, 3,859, 5,649 | 13, 2,303, 2,992 | 143 |
| Members, search by email | 5, 4,316, 6,553 | 6, 4,211, 6,159 | 285 |
| Gifts list (keyset) | 146, 193, 702 | 140, 210, 616 | 11 |
| Ledger journal (keyset) | 190, 162, 273 | 182, 166, 389 | 8 |
| Income statement | 217, 143, 256 | 210, 150, 239 | 8 |
| Balance sheet | 223, 140, 212 | 219, 144, 202 | 8 |
| Giving by month | 26, 245, 5,842 | **182**, **145**, **1,500** | 9 |
| Top givers | 45, 224, 7,271 | **200**, **147**, **704** | 8 |
| Lapsed givers | 117, 157, 3,104 | **197**, **155**, **539** | 9 |
| Giving retention | 109, 145, 5,161 | **228**, **135**, **414** | 8 |
| Sign in (bcrypt) | 9, 419, 571 | 9, 419, 567 | 414 |

Reading it honestly:
* The big wins are the dashboard, member lists and the giving reports (up to 7x the throughput, and the multi-second
  worst cases are gone). The gifts list, ledger and statements were already fast and are unchanged.
* **Member search is still the slowest thing** (about 140 ms for one search in a church of 50,000, 285 ms for an email
  fragment that matches thousands). It is bounded by one church's size, so a normal church sees a few milliseconds. I
  could not index it (see below) and did not hide that.
* **Sign-in takes ~0.4 s here on purpose**: that is bcrypt working hard so stolen password hashes are expensive to
  crack. On Oracle's faster cores it will be quicker; do not lower the cost to win a benchmark.
* "One user" figures for reports are with a warm cache. The **first** request after a change or after the cache
  expires does the real work: 0.3 to 1.3 seconds on 500,000 gifts, one request only (everyone else waits for that
  one, thanks to the stampede fix). The 32-client "after" run was taken while the (useless, since removed) trigram
  indexes still existed; reads are unaffected by that.
* **Cold start**: restarting just the API: 2.3 s until it answers through Caddy. Whole stack from stopped: 9.6 s
  (it was 19.9 s before I made the health checks poll once a second while starting).
* **Backup**: 11 MB file for the 556,000-row database in 3 s. **Restore drill**: 23 s. **Restore onto an empty
  server**: 33 s.


### The website itself, in a real browser

Headless Chrome 150, every load cold (cache off), median of 5 to 7 loads, served through Caddy. "Fast" has no
throttling (so it measures the app); "Slow phone" is Lighthouse's slow-4G network (150 ms latency, 1.6 Mbit/s) with the
CPU slowed 4x. FCP = first paint of content, LCP = largest paint, TBT = time the page was too busy to respond,
CLS = how much things jump around (0 is perfect). Sizes are what actually crosses the network (brotli).

| Page | Fast: FCP / LCP / TBT | Slow phone: FCP / LCP / TBT | CLS | Size over the wire |
|---|---|---|---|---|
| Sign in | 352 / 772 / 23 ms | 1,636 / 2,268 / 324 ms | 0 | 150 kB, 21 requests |
| Dashboard | 304 / 712 / 45 ms | 1,460 / 2,176 / 536 ms | 0 | 148 kB, 19 requests |
| Members | 324 / 560 / 63 ms | 1,476 / 2,036 / 585 ms | 0 | 158 kB, 24 requests |
| Gifts | 340 / 608 / 67 ms | 1,632 / 2,340 / 675 ms | 0 | 168 kB, 32 requests |
| Journal | 340 / 600 / 66 ms | 1,664 / 2,356 / 673 ms | 0 | 170 kB, 32 requests |

Of those 150-170 kB, about 113-126 kB is JavaScript, 8-10 kB styles and 23 kB the font. Code is split by page, the heavy
PDF libraries (about 590 kB before compression) only load when someone downloads a receipt, hashed files are cached
for a year, and Caddy serves files pre-compressed at build time, so no CPU is spent compressing per request. Zero
Content-Security-Policy violations and zero console errors on every page. Numbers move about +-100 ms on the slow
profile between runs.


How to repeat all of this yourself: `bench/` (`seed-bulk.sql` loads the synthetic data, `post-journal.mjs` adds ledger
entries through the API, `bench.mjs` measures endpoints, `web-vitals.mjs` measures page loads in headless Chrome).

### What made it faster (and what did not)

* **Dashboard and member lists:** counting through a join with `COUNT(DISTINCT ...)` on every list request was the main
  cost. Lists now count the table alone when nothing in the join can change the count. New indexes on
  `members (church_id, first_name, id)` and `(church_id, created_at desc, id desc)` remove the full scan and sort of
  every member. (`cmsbackend/src/common/tenant-repository.ts`, migration `20261004100000`.)
* **Giving reports:** a covering partial index on posted gifts lets Postgres answer monthly totals and top givers from
  the index alone.
* **Report stampedes:** when a cached report expired, every simultaneous request recomputed it (30 identical
  multi-second queries). Simultaneous requests for the same missing result now share one computation
  (`cmsbackend/src/common/cache.ts`). This removed the multi-second tail latencies on the giving reports.
* **Layout shift:** the Journal and Gifts filter bars used to jump when their account and fund dropdowns loaded
  (CLS 0.19 on a slow phone). Fixed with a stable width for dropdowns in filter bars; every page now measures 0.
* **Tried and rejected (measured, not guessed):** (1) *Trigram indexes for member search.* They looked right, but with
  row-level security on, Postgres will not use an index for `ILIKE` (the operator is not "leakproof"), so for the
  restricted role the planner chose a full scan every time. They were removed. Search costs one pass over **one
  church's** members: about 140 ms at 50,000 members, a few ms for a normal church. (2) *Preloading the web font.*
  A controlled A/B in Chrome showed no gain in first paint or largest paint (differences within noise, slightly worse
  on a slow network), so it was not shipped.

## Security checklist

- [ ] SSH with keys only (Oracle's images do this by default; do not enable password logins).
- [ ] `first-run.sh` ran: firewall allows only 22, 80, 443 (+UDP 443); automatic security updates on.
- [ ] Postgres, PgBouncer, Redis and the API publish no ports (checked by `smoke-test.sh`).
- [ ] The application database role cannot bypass row-level security (checked by `smoke-test.sh`; the API also refuses
      to start if it could).
- [ ] `.env` is mode 600, saved privately off the server, never committed (`.gitignore` covers it).
- [ ] JWT secret and database passwords are the generated 32-64 character ones.
- [ ] `MPESA_MODE=mock` and `SMS_MODE=mock` until real credentials are configured and tested.
- [ ] `DEMO_LOGINS=false` (the sign-in role picker is for demos only).
- [ ] Backups run, are copied off the server, and a restore drill passed this month.
- [ ] If behind Cloudflare: `TRUSTED_PROXIES` is Cloudflare's ranges (verified: with the default "trust nobody", a
      visitor cannot fake their address by sending `X-Forwarded-For` or `CF-Connecting-IP`; I tested that).

## What was tested, and what I could not verify

Tested (laptop, Docker, production configuration):
- The full stack builds and starts; `smoke-test.sh` passes (healthy services, HTTPS-ready Caddy, security headers,
  no host ports except Caddy's, restricted database role).
- A backup of the 500,000-gift database restores into a scratch database with all data, 97 row-level-security
  policies and the ledger intact, and the restricted role sees nothing without a church and exactly that church's rows
  with one (`restore.sh --drill`).
- **Disaster recovery onto a brand-new empty database server**: restored from a dump in 33 s; the API came up healthy,
  a user signed in, 50,008 members were visible, and the ledger's hash chain and audit chain both verified
  (`/finance/integrity`). This found and fixed a real bug: the restricted database role is created by an early
  migration, which a restored database already counts as done, so a restore onto a new server left the API unable to
  connect. `scripts/ensure-app-role.sh` now runs on every deploy and around every restore.
- The Content-Security-Policy in same-origin mode: pages load in Chrome with zero CSP violations and zero console errors.
- The reverse proxy ignores a visitor's spoofed address headers (default), and honours them only from trusted proxies.
- Backend test suite on Postgres and on SQLite, new tests for the cache, the member list counts and the new indexes;
  frontend typecheck, lint and tests.

Not verified:
- **No real server.** I could not create an Oracle account, SSH anywhere or deploy. Step 1 (clicking through Oracle),
  the firewall script on a real Oracle Ubuntu image (their images ship restrictive iptables rules; `first-run.sh`
  handles that case but it was written from their documented behaviour, not run there), certificate issuance from
  Let's Encrypt, and real Cloudflare behaviour are untested here.
- **ARM64 was not built.** This laptop is x86 and has no emulation set up. What I checked instead: every base image
  (`node:22-alpine`, `postgres:16-alpine`, `redis:7-alpine`, `caddy:2-alpine`, `edoburu/pgbouncer`) publishes an arm64
  build in its registry manifest, and the one native module (`bcrypt` 6) ships prebuilt arm64 binaries for both glibc
  and musl, with a compile-from-source fallback in the Dockerfile. If the first `up.sh` on an ARM machine fails, the
  error will be in the image build; send it to me.
- **HTTP/3** is enabled in Caddy and UDP 443 is published, but I did not test an HTTP/3 request (no HTTP/3 client here).
- Performance numbers are from a 2012 laptop, not Oracle's hardware; latency from Kenya to the region is not measured.
- Oracle's current free-tier terms (see limits above).

## Troubleshooting

* **`up.sh` says the API did not become healthy**: `docker compose -p cms -f docker-compose.prod.yml logs --tail 80 api migrate`.
  Usual causes: a wrong `.env` (the API refuses to start with a weak secret or a database role that can bypass
  security), or the database still starting on a slow disk (run `up.sh --no-build` again).
* **The site shows a certificate error**: the hostname does not point at the server yet, or ports 80/443 are closed
  (both in Oracle's security list and on the machine). `docker compose ... logs caddy` shows the ACME error.
* **"Origin not allowed"** in the browser console: `CORS_ORIGINS` does not list the exact address you are visiting
  (Vercel mode only; same-origin mode has no CORS).
* **Everyone is rate limited at once**: the server sees all visitors as one address. Behind Cloudflare, set
  `TRUSTED_PROXIES` (step 5).
* **Out of disk**: `docker system df`; `docker image prune -f`; old backups beyond retention are removed by `backup.sh`.
