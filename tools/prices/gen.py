import json, sys, urllib.parse
C = json.load(open('candidates.json'))
URL = {'aldi': 'https://www.aldi.co.uk/results?q={}', 'tesco': 'https://www.tesco.com/groceries/en-GB/search?query={}', 'asda': 'https://www.asda.com/groceries/search/{}', 'sainsburys': 'https://www.sainsburys.co.uk/gol-ui/SearchResults/{}'}
WAIT = {'aldi': 1500, 'tesco': 2500, 'asda': 3000, 'sainsburys': 3000}
JS = "await new Promise(r=>setTimeout(r,{w}));const L=document.body.innerText.split('\\n').map(s=>s.trim()).filter(Boolean);const R=[];L.forEach((l,i)=>{{if(/^£\\s?\\d/.test(l)&&R.length<8)R.push(L.slice(Math.max(0,i-6),i+2))}});let A=[];try{{A=JSON.parse(window.name||'[]')}}catch(e){{}}A.push({{s:'{s}',t:'{t}',r:R}});window.name=JSON.stringify(A);'ok '+R.length"
def batch(shop, start, n, tab):
    acts = []
    for c in C[start:start+n]:
        term = c['term']
        acts.append({"name": "navigate", "input": {"tabId": tab, "url": URL[shop].format(urllib.parse.quote(term))}})
        acts.append({"name": "javascript_tool", "input": {"tabId": tab, "action": "javascript_exec", "text": JS.format(w=WAIT[shop], s=shop, t=term.replace("'", "\\'"))}})
    return acts
if __name__ == '__main__':
    shop, start, n, tab = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
    print(json.dumps(batch(shop, start, n, tab)))
