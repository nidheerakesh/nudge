const T=Date.now();const B=process.env.BASE||'http://localhost:8813', O={origin:B,'content-type':'application/json'};
let bad=0;const log=(...a)=>console.log(...a);const ck=(n,ok)=>{console.log((ok?'PASS ':'FAIL ')+n);if(!ok)bad=1;};
async function signup(email,name){const r=await fetch(B+'/api/auth/signup',{method:'POST',headers:O,body:JSON.stringify({email,password:'test-pass-'+name+'-999',name})});const c=(r.headers.getSetCookie?.()||[]).map(x=>x.split(';')[0]).join('; ');return {s:r.status,c};}
async function api(c,m,p,b){const r=await fetch(B+p,{method:m,headers:{...O,cookie:c},body:b?JSON.stringify(b):undefined});let j=null;try{j=await r.json()}catch{}return {s:r.status,j};}
const A=await signup('ea'+T+'@town.test','Eva'), Bu=await signup('eb'+T+'@town.test','Bob');
log('signup',A.s,Bu.s);
for(const [u,n] of [[A,'Eva Home'],[Bu,'Bob Home']]){const j=await api(u.c,'POST','/api/town/join',{});log('join',j.s);await api(u.c,'PUT','/api/town/avatar',{skin:2,hair:3,hair_color:4});await api(u.c,'PUT','/api/town/house',{name:n});}
const meA=(await api(A.c,'GET','/api/town/me')).j, meB=(await api(Bu.c,'GET','/api/town/me')).j;
log('A me', meA.joined, meA.balance, meA.plot?.district);
const idA=meA.house? (await api(A.c,'GET','/api/town/me')).j : null;
function ws(c,path){return new Promise((res,rej)=>{const w=new WebSocket(B.replace('http','ws')+path,{headers:{cookie:c,origin:B}});const msgs=[];w.onmessage=e=>msgs.push(JSON.parse(e.data));w.onopen=()=>res({w,msgs});w.onerror=e=>rej(new Error('ws error '+(e.message||'')));w.onclose=e=>msgs.push({closed:e.code});});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const a=await ws(A.c,'/api/town/ws?district=0'), b=await ws(Bu.c,'/api/town/ws?district=0');
a.w.send(JSON.stringify({t:'hello'})); b.w.send(JSON.stringify({t:'hello'}));
await sleep(800);
log('A got', a.msgs.map(m=>m.t||m.closed), 'B got', b.msgs.map(m=>m.t||m.closed));
const uidA=a.msgs.find(m=>m.t==='snap')?.you, uidB=b.msgs.find(m=>m.t==='snap')?.you;
log('ids',uidA,uidB, 'B sees players', b.msgs.find(m=>m.t==='snap')?.players.map(p=>p.name));
b.w.send(JSON.stringify({t:'knock',house:uidA}));
await sleep(600);
const kn=a.msgs.find(m=>m.t==='knock'); log('A received knock from', kn?.from?.name);
a.w.send(JSON.stringify({t:'reply',id:kn.id,allow:true}));
await sleep(600);
log('B result', JSON.stringify(b.msgs.filter(m=>m.t==='result')));
const h=await ws(Bu.c,'/api/town/house/'+uidA+'/ws'); h.w.send(JSON.stringify({t:'hello'}));
await sleep(600); log('B in house', h.msgs.map(m=>m.t||m.closed));
const own=await ws(A.c,'/api/town/house/'+uidA+'/ws'); own.w.send(JSON.stringify({t:'hello'}));
await sleep(600);
h.w.send(JSON.stringify({t:'chat',text:'hello from Bob'}));
await sleep(600); log('A sees chat', own.msgs.filter(m=>m.t==='chat').map(m=>m.text||m.msg), 'inside', own.msgs.filter(m=>m.t==='inside').length);
// not allowed visitor: third user
const C=await signup('ec'+T+'@town.test','Cy'); await api(C.c,'POST','/api/town/join',{});
let deny='connected'; try{ const d=await ws(C.c,'/api/town/house/'+uidA+'/ws'); await sleep(500); deny='opened then '+JSON.stringify(d.msgs.map(m=>m.t||m.closed)); d.w.close(); }catch(e){deny='refused: '+e.message}
log('uninvited C ->', deny);
// coins: buy without coins
log('buy hoodie no coins', (await api(A.c,'POST','/api/town/buy',{item:'outfit:hoodie'})).j);
// verification: session with pings, no checkin => 0 coins
const sess=await api(A.c,'POST','/api/sessions',{start_at:new Date().toISOString(),plan_mins:25});
const sid=sess.j.rows[0].id; await api(A.c,'POST','/api/focus/ping',{session_id:sid,paused:false});
const p2=await api(A.c,'POST','/api/focus/ping',{session_id:sid,paused:false}); log('ping', p2.s, JSON.stringify(p2.j).slice(0,120));
await api(A.c,'PATCH','/api/sessions/'+sid,{end_kind:'done',act_mins:25});
log('balance after unverified session', (await api(A.c,'GET','/api/town/me')).j.balance);
ck('both signed up',A.s===200&&Bu.s===200);
ck('A joined with plot 0',meA.joined===true&&meA.plot?.district===0);
ck('B saw A in snapshot',(b.msgs.find(m=>m.t==='snap')?.players||[]).some(p=>p.id===uidA)||a.msgs.some(m=>m.t==='join'));
ck('A received knock',!!kn);
ck('B knock allowed',b.msgs.some(m=>m.t==='result'&&m.ok===true));
ck('B entered house',h.msgs.some(m=>m.t==='inside'));
ck('chat reached owner',own.msgs.some(m=>m.t==='chat'));
ck('uninvited refused',String(deny).startsWith('refused'));
ck('buy without coins denied',(await api(A.c,'POST','/api/town/buy',{item:'outfit:hoodie'})).j?.error==='coins');
ck('unverified session pays 0',(await api(A.c,'GET','/api/town/me')).j.balance===0);
for(const x of [a,b,h,own]) x.w.close(); process.exit(bad);
