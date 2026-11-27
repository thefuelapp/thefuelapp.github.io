# Tesco, laptop method (19 Sep 2026): the scanner function lives in sessionStorage.F on tesco.com (set once per tab), so each step is a
# navigate + one short eval; results collect in sessionStorage.A and leave via window.name → the dev server's /_relay drop box.
# Usage: FUEL_PORT=8766 python3 gen_ss.py <start> <count>   → prints browser_batch actions for the Browser pane tab "seed"
import json, sys, os, urllib.parse
T = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dumps/terms.json')))
start, n = int(sys.argv[1]), int(sys.argv[2]); tab = os.environ.get('FUEL_TAB', 'seed'); acts = []
for i, t in enumerate(T[start:start + n]):
    acts.append({"name": "navigate", "input": {"tabId": tab, "url": "https://www.tesco.com/groceries/en-GB/search?query=" + urllib.parse.quote(t['term'])}})
    reset = ""   # results build up across batches; F replaces an id it already holds
    acts.append({"name": "javascript_tool", "input": {"tabId": tab, "action": "javascript_exec", "text": reset + "eval(sessionStorage.F)(%s,%s)" % (json.dumps(t['id']), json.dumps(t['term']))}})
if os.environ.get('RELAY'):   # bank everything held so far in the drop box (tesco_all.txt), then go back to Tesco
    acts.append({"name": "javascript_tool", "input": {"tabId": tab, "action": "javascript_exec", "text": "window.name=sessionStorage.A;JSON.parse(window.name).length"}})
    acts.append({"name": "navigate", "input": {"tabId": tab, "url": "http://localhost:%s/_relay?name=tesco_all" % os.environ.get("FUEL_PORT", "8765")}})
print(json.dumps(acts, separators=(',', ':')))
