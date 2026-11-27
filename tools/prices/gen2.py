# Prints the javascript_tool text for one scrape chunk: python3 gen2.py <shop> <start> <n>
# Terms are embedded (shop sites' CSP blocks fetches to localhost) and results leave the tab by a form POST to the
# dev server's /_dump drop box (FUEL_DUMP_DIR=tools/prices/dumps node serve.mjs), saved as dumps/<shop>_<start>.txt.
import json, sys, os
T = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dumps/terms.json')))
shop, st, n = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
chunk = [[t['id'], t['term']] for t in T[st:st + n]]
FETCH = {
 'aldi': "async q=>{const r=await fetch('/results?q='+encodeURIComponent(q));const d=new DOMParser().parseFromString(await r.text(),'text/html');return [...d.querySelectorAll('.product-tile')].slice(0,40).map(t=>L(d,t))}",
 'tesco': "async q=>{const r=await fetch('/groceries/en-GB/search?query='+encodeURIComponent(q)+'&count=48');const d=new DOMParser().parseFromString(await r.text(),'text/html');return [...d.querySelectorAll('li')].filter(l=>/£\\d/.test(l.textContent)&&l.querySelector('a[href*=\"/products/\"]')).map(t=>L(d,t))}",
 'sainsburys': "async q=>{const r=await fetch('/groceries-api/gol-services/product/v1/product?filter[keyword]='+encodeURIComponent(q)+'&page_size=24');const j=await r.json();return (j.products||[]).map(p=>[p.name,p.retail_price&&p.retail_price.price,p.unit_price&&(p.unit_price.price+'/'+p.unit_price.measure_amount+p.unit_price.measure),p.nectar_price?1:0])}",
}
conc = 1 if shop == 'tesco' else 3  # Tesco's bot protection blocks fast loops: one at a time, 1.5s apart, 10 terms per chunk (the tool times out at 45s)
if shop == 'tesco': FETCH['tesco'] = FETCH['tesco'].replace("async q=>{", "async q=>{await new Promise(r=>setTimeout(r,1500));")
js = ("const TERMS=" + json.dumps(chunk, separators=(',', ':')) + ";"
      "const L=(d,t)=>{const w=d.createTreeWalker(t,NodeFilter.SHOW_TEXT);const o=[];let n;while(n=w.nextNode()){const s=n.textContent.trim();if(s)o.push(s)}return o};"
      "const F=" + FETCH[shop] + ";const out=[];let i=0;"
      "await Promise.all(Array.from({length:" + str(conc) + "},async()=>{while(i<TERMS.length){const [id,t]=TERMS[i++];try{out.push({id,t,r:await F(t)})}catch(e){out.push({id,t,err:String(e)})}}}));"
      "window.name=JSON.stringify(out);"
      "'ok '+out.length+' err '+out.filter(x=>x.err).length")
# The tab then navigates to http://localhost:8765/_relay?name=<shop>_<start>, which posts window.name into the drop box.
print(js)
