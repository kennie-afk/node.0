#!/usr/bin/env node
// Fills the people, worship and ministry screens of the demo church (run after seed-demo.mjs):
// member contact details, families, ministries, small groups, events, sermons, announcements
// and attendance.   node tools/seed-demo-extra.mjs [base-url]     default http://localhost:8080/api
// Demo only. Safe to run twice: it stops when the church already has events.
const B = process.argv[2] || 'http://localhost:8080/api';
const PASSWORD = process.env.DEMO_PASSWORD || 'DemoPass-12345';
const DOMAIN = process.env.DEMO_DOMAIN || 'grace-demo.test';
const call = async (m, p, tok, body) => {
  const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) { console.log('FAIL', m, p, r.status, JSON.stringify(j).slice(0, 200)); return null; }
  return j;
};
const login = await call('POST', '/auth/login', null, { email: `admin@${DOMAIN}`, password: PASSWORD });
const admin = login?.token; if (!admin) { console.log('cannot sign in as the demo admin'); process.exit(1); }
const have = await call('GET', '/events?limit=1', admin);
if ((have?.data ?? have)?.length) { console.log('demo extras already present'); process.exit(0); }
const list = await call('GET', '/members?limit=50', admin); const members = list?.data ?? list;
const byName = Object.fromEntries(members.map((m) => [`${m.firstName} ${m.lastName}`, m.id]));
const ids = Object.values(byName);

const fams = [['Kamau Family', 'Westlands, Nairobi', ['Wanjiku Kamau', 'Mwangi Njoroge']], ['Odhiambo Family', 'Kisumu Central', ['Otieno Odhiambo', 'Achieng Omondi']], ['Hassan Family', 'Nyali, Mombasa', ['Fatuma Hassan']]];
const famId = {};
for (const [i, [name, address, who]] of fams.entries()) {
  const f = await call('POST', '/families', admin, { familyName: name, address, city: address.split(', ')[1] ?? null, phoneNumber: `+25470010020${i}`, headOfFamilyMemberId: byName[who[0]] });
  if (f) for (const w of who) famId[w] = f.id;
}
const contacts = { 'Wanjiku Kamau': ['0712 345 601', 'F'], 'Otieno Odhiambo': ['0722 345 602', 'M'], 'Achieng Omondi': ['0733 345 603', 'F'], 'Mwangi Njoroge': ['0711 345 604', 'M'], 'Fatuma Hassan': ['0720 345 605', 'F'], 'Kiprop Rotich': ['0721 345 606', 'M'], 'Naliaka Wekesa': ['0722 345 607', 'F'], 'Baraka Mutua': ['0723 345 608', 'M'] };
for (const [n, id] of Object.entries(byName)) {
  const c = contacts[n]; if (!c) continue;
  const [first, last] = n.split(' ');
  await call('PUT', `/members/${id}`, admin, { email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`, phoneNumber: c[0].replace(/\s/g, ''), gender: c[1] === 'F' ? 'Female' : 'Male', familyId: famId[n] ?? null });
}
const min = {};
for (const [name, description, leader] of [['Worship Team', 'Music and sound for Sunday services', 'Naliaka Wekesa'], ['Youth Ministry', 'Teens and young adults', 'Baraka Mutua'], ['Hospitality', 'Welcome, ushering and tea after service', 'Fatuma Hassan'], ['Outreach', 'Community visits and food drives', 'Kiprop Rotich']]) {
  const m = await call('POST', '/ministries', admin, { name, description, leaderId: byName[leader] }); if (m) min[name] = m.id;
}
const roster = { 'Worship Team': ['Naliaka Wekesa', 'Wanjiku Kamau', 'Otieno Odhiambo'], 'Youth Ministry': ['Baraka Mutua', 'Achieng Omondi'], Hospitality: ['Fatuma Hassan', 'Mwangi Njoroge', 'Wanjiku Kamau'], Outreach: ['Kiprop Rotich', 'Baraka Mutua'] };
for (const [n, who] of Object.entries(roster)) for (const w of who) await call('POST', `/ministries/${min[n]}/members`, admin, { memberId: byName[w], role: w === who[0] ? 'Leader' : 'Member' });
const groups = [['Westlands Cell', 'Weekly midweek cell group', 'Hospitality', 'Wednesday', '19:00', "Kamau residence", 'Mwangi Njoroge'], ['Youth Fellowship', 'Bible study and games', 'Youth Ministry', 'Friday', '18:30', 'Church annex', 'Baraka Mutua'], ['Kisumu Prayer Circle', 'Early morning prayer', 'Outreach', 'Tuesday', '05:30', 'Odhiambo residence', 'Otieno Odhiambo']];
const sg = [];
for (const [name, description, m, meetingDay, meetingTime, meetingLocation, leader] of groups) {
  const g = await call('POST', '/small-groups', admin, { name, description, ministryId: min[m], leaderId: byName[leader], meetingDay, meetingTime, meetingLocation });
  if (g) sg.push(g.id);
}
// Event times are stored as UTC and shown in the viewer's time zone, so these are Nairobi time minus 3 hours.
const ev = {};
for (const [name, type, start, end, location, description] of [
  ['Sunday Worship Service', 'Service', '2026-11-01T06:00', '2026-11-01T08:30', 'Main sanctuary', 'Weekly worship service'],
  ['Sunday Worship Service', 'Service', '2026-11-08T06:00', '2026-11-08T08:30', 'Main sanctuary', 'Weekly worship service'],
  ['Midweek Prayer', 'Meeting', '2026-11-04T15:00', '2026-11-04T16:30', 'Church annex', 'Prayer and intercession'],
  ['Youth Conference', 'Conference', '2026-11-21T06:00', '2026-11-21T13:00', 'Church grounds', 'Annual youth conference'],
  ['Community Food Drive', 'Outreach', '2026-11-28T07:00', '2026-11-28T11:00', 'Kibera', 'Food parcels for 120 households'],
  ['Sunday Worship Service', 'Service', '2026-11-15T06:00', '2026-11-15T08:30', 'Main sanctuary', 'Weekly worship service']]) {
  const e = await call('POST', '/events', admin, { name, type, startTime: start, endTime: end, location, description }); if (e) ev[start] = e.id;
}
const serm = [];
for (const [title, speaker, date, passage, summary, ek] of [
  ['Walking in Faith', 'Naliaka Wekesa', '2026-11-08', 'Hebrews 11:1-6', 'Faith as confidence in what we hope for.', '2026-11-08T06:00'],
  ['The Good Shepherd', 'Kiprop Rotich', '2026-11-01', 'John 10:1-18', 'The shepherd who knows his sheep by name.', '2026-11-01T06:00'],
  ['Grace That Sustains', 'Mwangi Njoroge', '2026-10-25', '2 Corinthians 12:7-10', 'Strength made perfect in weakness.', null],
  ['Serving One Another', 'Baraka Mutua', '2026-10-18', 'Galatians 5:13-15', 'Freedom used to serve in love.', null]]) {
  const s = await call('POST', '/sermons', admin, { title, speakerMemberId: byName[speaker], datePreached: date, passageReference: passage, summary, eventId: ek ? ev[ek] : null }); if (s) serm.push(s.id);
}
for (const [title, content, targetAudience] of [
  ['Youth Conference registration open', 'Registration for the annual youth conference on 21 November is now open at the church office. Lunch is provided.', 'All'],
  ['Choir rehearsal moved to Thursday', 'This week only, choir rehearsal moves to Thursday at 6pm in the main sanctuary.', 'Members'],
  ['Leaders meeting after service', 'All ministry leaders are asked to stay for a short planning meeting after Sunday service.', 'Leaders']]) {
  await call('POST', '/announcements', admin, { title, content, isPublished: true, targetAudience });
}
const types = ['In-person', 'In-person', 'In-person', 'Online'];
let n = 0;
for (const date of ['2026-11-01', '2026-11-08']) for (const m of ids) await call('POST', '/attendance', admin, { memberId: m, attendanceDate: date, eventId: ev[date + 'T06:00'], attendanceType: types[n++ % 4] });
await call('POST', '/attendance', admin, { guestName: 'Visitor: Grace Njeri', attendanceDate: '2026-11-08', eventId: ev['2026-11-08T06:00'], attendanceType: 'In-person' });
for (const [i, m] of ids.slice(0, 5).entries()) await call('POST', '/attendance', admin, { memberId: m, attendanceDate: '2026-11-08', sermonId: serm[0], attendanceType: i % 2 ? 'Online' : 'In-person' });
console.log('extras done');
// A few gifts in the current month so the dashboard's "giving this month" is not empty.
const tre = (await call('POST', '/auth/login', null, { email: `treasurer@${DOMAIN}`, password: PASSWORD }))?.token;
if (tre) {
  const now = new Date(); const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  for (const [k, day] of [1, 2, 3, 6, 8].entries()) {
    const r = await fetch(B + '/giving/contributions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tre, 'Idempotency-Key': `seed-gift-now-${k}-bbbb` }, body: JSON.stringify({ date: `${ym}-0${day}`, amount: 1500 + k * 900, memberId: ids[k % ids.length], contributionType: k % 2 ? 'Tithe' : 'Offering', paymentMethod: k % 2 ? 'MPESA' : 'CASH' }) });
    if (!r.ok) console.log('FAIL gift', r.status);
  }
}
