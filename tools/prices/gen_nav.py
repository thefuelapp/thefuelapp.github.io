# Tesco via real page loads (its bot protection blocks fetch loops): prints browser_batch actions for 11 terms from <start>,
# each = navigate to the search page + scan the rendered tiles into window.name, then a relay hop into the drop box.
import json, sys, os, urllib.parse
T = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dumps/terms.json')))
start = int(sys.argv[1]); chunk = T[start:start + 11]
JS = "const L=t=>{const w=document.createTreeWalker(t,NodeFilter.SHOW_TEXT);const o=[];let n;while(n=w.nextNode()){const s=n.textContent.trim();if(s)o.push(s)}return o};const R=[...document.querySelectorAll('li')].filter(l=>/£\\d/.test(l.textContent)&&l.querySelector('a[href*=\"/products/\"]')).map(L);let A=[];try{A=JSON.parse(window.name||'[]')}catch(e){}A.push({id:%s,t:%s,r:R});window.name=JSON.stringify(A);'ok '+R.length+' acc '+A.length"
acts = []
for t in chunk:
    acts.append({"name": "navigate", "input": {"url": "https://www.tesco.com/groceries/en-GB/search?query=" + urllib.parse.quote(t['term'])}})
    acts.append({"name": "javascript_tool", "input": {"action": "javascript_exec", "text": JS % (json.dumps(t['id']), json.dumps(t['term']))}})
acts.append({"name": "navigate", "input": {"url": "http://localhost:%s/_relay?name=tesco_%d" % (os.environ.get("FUEL_PORT", "8765"), start)}})
acts.append({"name": "computer", "input": {"action": "wait", "duration": 1}})
print(json.dumps(acts))
