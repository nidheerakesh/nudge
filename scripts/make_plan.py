import json,subprocess,sys,datetime as dt,os
OUT=sys.argv[1] if len(sys.argv)>1 else 'plan'
os.makedirs(OUT,exist_ok=True)
START=dt.date(2026,10,26);NOW='17:30'
ONE={'IHS311','IHS313'}
FULL=[('07:30','09:00'),('09:20','10:50'),('11:10','12:40'),('14:00','15:30'),('15:50','17:20'),('17:40','19:10'),('21:00','22:30')]
EXD=[('07:30','09:00'),('14:00','15:30'),('15:50','17:20'),('17:40','19:10'),('21:00','22:30')]
TODAY=[('17:30','19:00'),('21:00','22:30')]
FIX=[('07:00',30,'Morning routine'),('13:00',60,'Lunch'),('20:00',60,'Dinner')]
def q(sql):
    o=subprocess.run(['npx','wrangler','d1','execute','onething-db','--remote','--json','--command',sql],capture_output=True,text=True).stdout
    return json.loads(o[o.index('['):])[0]['results']
def m(s):a,b=s.split(':');return int(a)*60+int(b)
def hm(x):return '%02d:%02d'%(x//60,x%60)
cs=q('SELECT id,name,date,time FROM courses ORDER BY date')
tp=q('SELECT id,course_id,title,mins,done FROM topics WHERE done=0 ORDER BY id')
tk=q("SELECT id,title,due,done FROM tasks WHERE title LIKE 'IMA314 Assignment 2%'")
code=lambda c:c['name'].split()[0]
short=lambda c:c['name'].split(' ',1)[1][:28]
rem={c['id']:[dict(t) for t in tp if t['course_id']==c['id']] for c in cs}
need={c['id']:sum(t['mins'] or 45 for t in rem[c['id']]) for c in cs}
exd={c['date']:c for c in cs}
eve={str(dt.date.fromisoformat(c['date'])-dt.timedelta(1)):c for c in cs}
blocks=[];md=[];over={}
def put(d,s,mins,kind,title,rk=None,rid=None):blocks.append(dict(day=d,start=s,mins=mins,kind=kind,title=title,ref_kind=rk,ref_id=rid))
def take(c,cap):
    out=[];left=cap;lst=rem[c['id']]
    while left>0 and lst:
        for x in lst:
            if x['mins'] is None:x['mins']=45
        t=lst[0];n=t['mins'];idx=0
        if n<=left:use=n
        elif left>=30:use=left
        else:
            idx=next((k for k,x in enumerate(lst) if x['mins']<=left),None)
            if idx is None:break
            t=lst[idx];n=t['mins'];use=n
        out.append((t,use,use<n or t.get('_p')))
        t['mins']=n-use;t['_p']=True
        left-=use
        if t['mins']<=0:lst.pop(idx)
    return out
d=START;end=dt.date(2026,11,13)
while d<=end:
    ds=str(d)
    wins=TODAY if d==START else EXD if ds in exd else FULL
    fx=[f for f in FIX if not (d==START and f[2]!='Dinner')]
    for s,mn,t in fx:put(ds,s,mn,'fixed',t)
    if ds in exd:put(ds,'09:30',180,'fixed','Exam: '+short(exd[ds]))
    lines=[];wi=0
    ev=eve.get(ds)
    cur=[];pp=0
    def fill_window(s,e,items):
        pos=m(s)
        for it in items:
            kind,title,mins,rk,rid=it
            put(ds,hm(pos),mins,kind,title,rk,rid);lines.append((hm(pos),mins,title));pos+=mins
    for i,(s,e) in enumerate(wins):
        cap=m(e)-m(s);items=[]
        pin=next((c for c in cs if code(c)=='IEG313'),None)
        pt=next((x for x in rem[pin['id']] if x['title']=='Quantum error correction'),None) if pin else None
        if ds=='2026-10-30' and i==len(wins)-1 and pt:
            rem[pin['id']].remove(pt)
            items=[('focus','IEG313: Quantum error correction',pt['mins'] or 45,'topic',pt['id'])]
        elif d==START and i==0 and tk and not tk[0]['done']:
            items=[('focus','IMA314 Assignment 2 (due 11 PM)',90,'task',tk[0]['id'])]
        elif ds in exd and i==0:
            items=[('focus','Recap + past papers: '+short(exd[ds]),90,None,None)]
        elif ev:
            ch=take(ev,cap)
            items=[('focus',t['title']+(' (part)' if p else ''),u,'topic',t['id']) for t,u,p in ch]
            used=sum(x[2] for x in items)
            if used<cap and code(ev) not in ONE and (used>0 or pp<4):
                items.append(('focus','Past papers + quick recap: '+short(ev),cap-used,None,None))
                if used==0:pp+=1
        else:
            ups=[c for c in cs if c['date']>ds and code(c) not in ONE and rem[c['id']]]
            left=cap
            for c in ups:
                if left<=0:break
                for t,u,p in take(c,left):
                    items.append(('focus','%s: %s%s'%(code(c),t['title'],' (part)' if p else ''),u,'topic',t['id']));left-=u
            if left>0 and not items:
                if over.get(ds,0)<2:
                    items=[('focus','EXTRA: you pick a topic (PDC, QC or Opt DS)',cap,None,None)];over[ds]=over.get(ds,0)+1
        if items:
            fill_window(s,e,items)
            if i<len(wins)-1 and sum(x[2] for x in items)>=cap:
                put(ds,e,20,'break','Break');lines.append((e,20,'Break'))
    lines.sort()
    tag=(' (EXAM DAY: '+short(exd[ds])+')' if ds in exd else '')+(' (eve of '+short(ev)+')' if ev else '')
    md.append('\n## '+d.strftime('%a %d %b')+tag+'\n')
    fixl=[(f[0],f[1],f[2]) for f in fx]+([('09:30',180,'Exam: '+short(exd[ds]))] if ds in exd else [])
    for s,mn,t in sorted(fixl+lines):md.append('- %s to %s  %s'%(s,hm(m(s)+mn),t))
    if not lines:md.append('- (free day, nothing to study)')
    d+=dt.timedelta(1)
md.append('\n## Not scheduled (topics left over)\n')
bad=0
for c in cs:
    r=rem[c['id']]
    if r:
        bad+=1;md.append('- %s: %d topics, %d min short: %s'%(short(c),len(r),sum(t['mins'] or 45 for t in r),', '.join(t['title'] for t in r)))
if not bad:md.append('- None. Every topic fits before its exam.')
open(os.path.join(OUT,'study-plan.md'),'w').write('# Study plan\n'+'\n'.join(md)+'\n')
sql=["DELETE FROM blocks WHERE day>='2026-10-26' AND day<='2026-11-13' AND (kind IN ('focus','break') OR title IN ('Morning routine','Lunch','Dinner') OR title LIKE 'Exam: %');"]
for b in blocks:
    f=lambda v:'NULL' if v is None else ("'"+str(v).replace("'","''")+"'" if isinstance(v,str) else str(v))
    sql.append("INSERT INTO blocks(day,start,mins,kind,title,ref_kind,ref_id,done) VALUES(%s,%s,%d,%s,%s,%s,%s,0);"%(f(b['day']),f(b['start']),b['mins'],f(b['kind']),f(b['title']),f(b['ref_kind']),f(b['ref_id'])))
open(os.path.join(OUT,'blocks.sql'),'w').write('\n'.join(sql)+'\n')
print('blocks',len(blocks),'unscheduled courses',bad)
