# Summarizes agent-compare.mts output: python3 tools/model-eval/analyze-agent-compare.py docs/eval/model-comparison-raw.jsonl
import json,sys,statistics as st
# Token Factory list prices (USD per token, input/output) from GET /v1/models?verbose=true on Oct 28, 2026.
price={"nvidia/nemotron-3-super-120b-a12b":(0.3e-6,0.9e-6),"nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B":(0.06e-6,0.24e-6),
 "Qwen/Qwen3-235B-A22B-Instruct-2507":(0.2e-6,0.6e-6),"Qwen/Qwen3-30B-A3B-Instruct-2507":(0.1e-6,0.3e-6),
 "openai/gpt-oss-120b":(0.15e-6,0.6e-6),"deepseek-ai/DeepSeek-V4-Flash-0731":(0.14e-6,0.28e-6)}
TOOLS={'get_friend_picks','get_title_details','get_watch_history','search_catalog'}
out=[]; tot=0
allrows=[json.loads(l) for l in open(sys.argv[1])]
for m in dict.fromkeys(r['model'] for r in allrows):
    rows=[r for r in allrows if r['model']==m]
    succ=[r for r in rows if r['source']=='nemotron-agent' and r['status']==r['expect'] and (r['status']!='ok' or r['picks']) and r.get('fromOk') is not False and (r['q']!='short-funny' or all((p.get('runtime') or 999)<=45 for p in r['picks']))]
    byq={}
    for r in rows: byq.setdefault(r['q'],[0,0]); byq[r['q']][1]+=1; byq[r['q']][0]+= r in succ
    watch=[r for r in rows if r['q']!='capital']
    selfcall=sum(any('get_friend_picks' in c.get('toolNames',[]) for c in r['calls'] if c['phase']=='agent') for r in watch)
    auto=sum(r['autoFriendPicks'] for r in rows); nud=sum(r['nudged'] for r in rows)
    bad=sum(c.get('badArgs',0)+sum(n not in TOOLS for n in c.get('toolNames',[])) for r in rows for c in r['calls'])
    ntool=sum(len(c.get('toolNames',[])) for r in rows for c in r['calls'])
    firsts=[next((c['parsed'] for c in r['calls'] if c['phase']=='agent' and c.get('parsed') is not None),None) for r in rows]
    fj=sum(1 for x in firsts if x); fjn=sum(1 for x in firsts if x is not None)
    drops=[d for r in rows for d in r['drops']]
    dropruns=sum(1 for r in rows if r['drops'])
    sh=[r for r in rows if r['q']=='short-funny']; shv=sum(r['shortViolated'] or not all((p.get('runtime') or 999)<=45 for p in r['picks']) for r in sh)
    shfinal=sum(all((p.get('runtime') or 999)<=45 for p in r['picks']) and r['picks']!=[] for r in sh)
    ms=sorted(r['ms'] for r in rows); p90=ms[min(len(ms)-1,int(0.9*len(ms)+0.5)-1)]
    it=sum(c.get('inTok',0) for r in rows for c in r['calls']); ot=sum(c.get('outTok',0) for r in rows for c in r['calls'])
    pi,po=price[m]; cost=it*pi+ot*po; tot+=cost
    srcs={s:sum(r['source']==s for r in rows) for s in set(r['source'] for r in rows)}
    fails=[(r['q'],r['run'],r['status'],r['source'],[p['title'] for p in r['picks']],r['drops'],r['nudged'],r['offTopicRejected']) for r in rows if r not in succ]
    out.append(dict(model=m,n=len(rows),succ=len(succ),byq=byq,selfcall=f"{selfcall}/{len(watch)}",auto=auto,nudged=nud,bad=f"{bad}/{ntool}",firstjson=f"{fj}/{fjn}",dropruns=dropruns,drops=drops,short=f"{len(sh)-shv}/{len(sh)}",shfinal=shfinal,p50=st.median(ms),p90=p90,inTok=it,outTok=ot,cost=round(cost,4),srcs=srcs,fails=fails))
for o in out: print(json.dumps(o)); print()
print('TOTAL $',round(tot,4))
