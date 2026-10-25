import json,subprocess,sys,glob,os
SRC=sys.argv[1]
APPLY='--apply' in sys.argv
MAP={'AI':'CSE311','Software Architecture':'CSE312','PDC':'CSS311','QC':'IEG313','Opt DS':'IMA314','Finance':'IHS312'}
def q(sql):
    out=subprocess.run(['npx','wrangler','d1','execute','onething-db','--remote','--json','--command',sql],capture_output=True,text=True).stdout
    return json.loads(out[out.index('['):])[0]['results']
courses=q('SELECT id,name FROM courses')
sql=[];matched=0;missing=[]
for f in glob.glob(os.path.join(SRC,'*.json')):
    d=json.load(open(f));k=os.path.basename(f)[:-5]
    cid=[c['id'] for c in courses if c['name'].startswith(MAP.get(k,'~~'))]
    if not cid:missing.append(k);continue
    have={r['title'] for r in q('SELECT title FROM topics WHERE course_id=%d'%cid[0])}
    for t in d['topics']:
        if t['title'] in have:
            matched+=1;sql.append("UPDATE topics SET mins=%d WHERE course_id=%d AND title='%s';"%(t['mins'],cid[0],t['title'].replace("'","''")))
        else:print('no match:',k,'|',t['title'])
print('courses not found:',missing)
print('matched topics:',matched)
if APPLY:
    open('/tmp/claude-1001/backfill.sql','w').write('\n'.join(sql))
    subprocess.run(['npx','wrangler','d1','execute','onething-db','--remote','--file','/tmp/claude-1001/backfill.sql'])
    print('applied')
else:print('dry run, nothing written')
