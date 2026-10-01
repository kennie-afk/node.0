#!/usr/bin/env node
// Demo data: one church, one account per role, and a year of gifts, bills and payroll.
//   node tools/seed-demo.mjs [base-url]      default http://localhost:8080/api
// Safe to run twice: it stops if the church already has gifts. Demo only; never run it against
// production. Pair it with a web image built with DEMO_LOGINS=true to get the sign-in role picker.
const B = process.argv[2] || 'http://localhost:8080/api';
const PASSWORD = process.env.DEMO_PASSWORD || 'DemoPass-12345';
const DOMAIN = process.env.DEMO_DOMAIN || 'grace-demo.test';
const call=async(m,p,tok,body,extra={})=>{const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{}),...extra},body:body?JSON.stringify(body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}if(!r.ok){console.log('FAIL',m,p,r.status,JSON.stringify(j).slice(0,220));return null}return j};
const login=async(e,p)=>(await call('POST','/auth/login',null,{email:e,password:p})).token;
await call('POST','/churches',null,{church:{name:'Grace Chapel Demo',slug:'grace-demo'},owner:{username:'admin',email:`admin@${DOMAIN}`,password:PASSWORD}});
const admin=await login(`admin@${DOMAIN}`,PASSWORD);
if(!admin){console.log('cannot sign in as the demo admin');process.exit(1)}
for(const r of ['TREASURER','APPROVER','AUDITOR','PASTOR','SECRETARY','MEMBER']) await call('POST','/users',admin,{username:r.toLowerCase(),email:`${r.toLowerCase()}@${DOMAIN}`,password:PASSWORD,role:r});
const existing=await call('GET','/giving/contributions?limit=1',admin);
if(existing?.data?.length){console.log('demo data already present, accounts ensured');process.exit(0)}
const tre=await login(`treasurer@${DOMAIN}`,PASSWORD), app=await login(`approver@${DOMAIN}`,PASSWORD);
const accts=(await call('GET','/finance/accounts',admin)), funds=(await call('GET','/finance/funds',admin));
const A=c=>accts.find(a=>a.code===c)?.id, F=c=>funds.find(f=>f.code===c)?.id;
console.log('funds',funds.map(f=>f.code).join(','));
const names=[['Wanjiku','Kamau'],['Otieno','Odhiambo'],['Achieng','Omondi'],['Mwangi','Njoroge'],['Fatuma','Hassan'],['Kiprop','Rotich'],['Naliaka','Wekesa'],['Baraka','Mutua']];
const mem=[];for(const [f,l] of names){const m=await call('POST','/members',admin,{firstName:f,lastName:l});if(m)mem.push(m.id)}
const yr=2026, d=(m,dd)=>`${yr}-${String(m).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
let n=0;const methods=['CASH','MPESA','BANK'];
for(let m=1;m<=9;m++){for(let k=0;k<8;k++){const amt=500+((m*37+k*131)%9)*750;await call("POST","/giving/contributions",tre,{date:d(m,2+k*3),amount:amt,memberId:mem[k%mem.length],contributionType:k%3===0?'Tithe':k%3===1?'Offering':'Thanksgiving',paymentMethod:methods[k%3]},{'Idempotency-Key':`seed-gift-${m}-${k}-aaaa`});n++}}
console.log('gifts attempted',n);
const vend={};for(const v of [['Kenya Power','P051234567Z'],['Nairobi Water','P051234568Z'],['Sound & Stage Ltd','P051234569Z'],['Naivas Supplies','P051234570Z']]){const r=await call('POST','/payables/vendors',tre,{name:v[0],kraPin:v[1],mpesaNumber:'0712345678'});if(r)vend[v[0]]=r.id}
const billsDef=[['Kenya Power',4,'5110','18400.00'],['Nairobi Water',4,'5110','6200.00'],['Sound & Stage Ltd',5,'5120','72000.00'],['Naivas Supplies',6,'5130','9800.00'],['Kenya Power',7,'5110','19650.00'],['Kenya Power',9,'5110','21100.00']];
let i=0;for(const [v,m,ac,amt] of billsDef){const b=await call('POST','/payables/bills',tre,{vendorId:vend[v],billDate:d(m,3),dueDate:d(m,28),reference:`INV-${1000+i++}`,lines:[{accountId:A(ac),fundId:F('GEN'),amount:amt,description:'Monthly'}]});if(!b)continue;await call('POST',`/payables/bills/${b.id}/submit`,tre);if(i<=4){await call('POST',`/payables/bills/${b.id}/approve`,app,{});}}
console.log('bills done');
for(const [fn,pin,sal] of [['Pastor Grace Wanjiru','A123456789Z','80000.00'],['James Ochieng','A123456790Z','45000.00'],['Mercy Chebet','A123456791Z','32000.00']]) await call('POST','/payroll/employees',tre,{fullName:fn,kraPin:pin,basicSalary:sal,startDate:'2025-01-01',bankName:'KCB',bankAccount:'1234567890',fundId:F('GEN')});
for(const mo of [8,9]){const run=await call('POST','/payroll/runs',tre,{year:yr,month:mo});if(!run)continue;await call('POST',`/payroll/runs/${run.id}/calculate`,tre);await call('POST',`/payroll/runs/${run.id}/approve`,app,{});await call('POST',`/payroll/runs/${run.id}/post`,tre,{});}
console.log('payroll done');
const tb=await call('GET','/finance/trial-balance',admin);console.log('trial balance lines',tb?.lines?.length, JSON.stringify(tb?.totals||{}).slice(0,150));
