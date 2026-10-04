// Real-browser load metrics for the console, headless Chrome via puppeteer-core.
//   NODE_PATH=<dir with puppeteer-core>/node_modules node web-vitals.mjs http://127.0.0.1:8180 admin@grace-demo.test DemoPass-12345
// Each page is loaded cold (cache disabled) 5 times per profile; the median is reported.
//   "fast":   no throttling (the same machine as the server: measures the app, not the network)
//   "mobile": 4x CPU slowdown + Lighthouse's "slow 4G" network (150 ms RTT, 1.6 Mbit/s down, 750 kbit/s up)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const [origin, email, password] = process.argv.slice(2);
const RUNS = Number(process.env.RUNS ?? 5);
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function measure(path, profile, session) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (profile === 'mobile') {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  }
  let bytes = 0, requests = 0, jsBytes = 0, cssBytes = 0, fontBytes = 0;
  const types = new Map();
  cdp.on('Network.responseReceived', (e) => types.set(e.requestId, e.type));
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; requests += 1; const t = types.get(e.requestId); if (t === 'Script') jsBytes += e.encodedDataLength; if (t === 'Stylesheet') cssBytes += e.encodedDataLength; if (t === 'Font') fontBytes += e.encodedDataLength; });
  const errors = []; const violations = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) violations.push(t.slice(0, 160)); else if (m.type() === 'error') errors.push(t.slice(0, 160)); });
  await page.evaluateOnNewDocument(() => {
    window.__m = { lcp: 0, fcp: 0, cls: 0, tbt: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 50) window.__m.tbt += e.duration - 50; }).observe({ type: 'longtask', buffered: true });
  });
  if (process.env.INTERCEPT_HTML) {
    // A/B switch: both arms fetch index.html through this script (same overhead); STRIP_PRELOAD=1 removes the font preload link.
    await page.setRequestInterception(true);
    page.on('request', async (req) => {
      if (req.isNavigationRequest() && req.resourceType() === 'document') {
        const res = await fetch(req.url(), { headers: { 'accept-encoding': 'gzip' } });
        let html = await res.text();
        if (process.env.STRIP_PRELOAD) html = html.replace(/<link rel="preload" as="font"[^>]*>\s*/g, '');
        return req.respond({ status: res.status, contentType: 'text/html; charset=utf-8', headers: { 'cache-control': 'no-cache' }, body: html });
      }
      return req.continue();
    });
  }
  if (session) await page.evaluateOnNewDocument((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, session);
  await page.goto(origin + path, { waitUntil: 'networkidle0', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 400));
  const m = await page.evaluate(() => ({ ...window.__m, nav: performance.getEntriesByType('navigation')[0]?.responseStart ?? 0, dcl: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? 0 }));
  await page.close();
  return { ...m, bytes, requests, jsBytes, cssBytes, fontBytes, errors, violations };
}

// Sign in once through the API to get a token, and learn how the console stores its session.
const loginPage = await browser.newPage();
await loginPage.goto(origin + '/login', { waitUntil: 'networkidle0' });
const inputs = await loginPage.$$('input');
await inputs[0].type(email); await inputs[1].type(password);
await Promise.all([loginPage.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}), loginPage.keyboard.press('Enter')]);
const session = await loginPage.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
await loginPage.close();
if (!Object.keys(session).length) console.log('WARNING: no session found after login; authenticated pages will redirect to login');

const pages = [['login', '/login', null], ['dashboard', '/dashboard', session], ['members', '/members', session], ['giving', '/giving/contributions', session], ['journal', '/finance/journal', session]];
console.log(`Chrome ${await browser.version()}; ${RUNS} cold loads per cell, median; transferred bytes are compressed on the wire`);
console.log('page'.padEnd(11), 'profile'.padEnd(7), 'TTFB'.padStart(6), 'FCP'.padStart(7), 'LCP'.padStart(7), 'TBT'.padStart(6), 'CLS'.padStart(6), 'kB total'.padStart(9), 'kB js'.padStart(7), 'kB css'.padStart(7), 'kB font'.padStart(8), 'reqs'.padStart(5), ' errors/CSP');
for (const profile of ['fast', 'mobile']) {
  for (const [name, path, sess] of pages) {
    const runs = [];
    for (let i = 0; i < RUNS; i += 1) runs.push(await measure(path, profile, sess));
    const f = (k) => median(runs.map((r) => r[k]));
    const errs = [...new Set(runs.flatMap((r) => r.errors))].length, csp = [...new Set(runs.flatMap((r) => r.violations))];
    console.log(name.padEnd(11), profile.padEnd(7), f('nav').toFixed(0).padStart(6), f('fcp').toFixed(0).padStart(7), f('lcp').toFixed(0).padStart(7), f('tbt').toFixed(0).padStart(6), f('cls').toFixed(3).padStart(6), (f('bytes') / 1024).toFixed(0).padStart(9), (f('jsBytes') / 1024).toFixed(0).padStart(7), (f('cssBytes') / 1024).toFixed(0).padStart(7), (f('fontBytes') / 1024).toFixed(0).padStart(8), String(f('requests')).padStart(5), ' ' + errs + ' distinct errors, ' + csp.length + ' CSP' + (csp[0] ? ': ' + csp[0] : ''));
  }
}
await browser.close();
