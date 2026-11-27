import json, sys, urllib.parse
C = json.load(open('candidates.json')); TAB = 1031487128
JS = "const t='{t}';const t0=Date.now();let R=[];while(Date.now()-t0<6000){{const L=document.body.innerText.split('\\n').map(s=>s.trim()).filter(Boolean);R=[];L.forEach((l,i)=>{{if(/^\u00a3\\s?\\d/.test(l)&&!/\\//.test(l)&&R.length<7)R.push(L.slice(Math.max(0,i-4),i+2).join(' | '))}});if(R.length>=3)break;await new Promise(r=>setTimeout(r,400))}}let S=JSON.parse(window.name||'{{}}');S.asda=S.asda||[];S.asda.push({{t,r:R}});window.name=JSON.stringify(S);R.length"
start, n = int(sys.argv[1]), int(sys.argv[2])
acts = []
for c in C[start:start+n]:
    t = c['term']
    acts.append({"name": "navigate", "input": {"tabId": TAB, "url": "https://www.asda.com/groceries/search/" + urllib.parse.quote(t)}})
    acts.append({"name": "javascript_tool", "input": {"tabId": TAB, "action": "javascript_exec", "text": JS.format(t=t.replace("'", "\\'"))}})
acts[-1]['input']['text'] += ";localStorage.setItem('fuel_asda',window.name);S.asda.length"
print(json.dumps(acts))
