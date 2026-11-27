# ASDA prices via the public Algolia search index its website uses (14 Sep 2026): the app id, search-only key and index
# name sit in every asda.com page's config (window.__CONFIG__.app.algolia). One query per term; writes dumps/asda.json.
import json, os, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
APP, KEY, INDEX = '8I6WSKCCNV', '03e4272048dd17f771da37b57ff8a75e', 'ASDA_PRODUCTS'
T = json.load(open(os.path.join(HERE, 'dumps/terms.json')))
def query(q, n=24):
    req = urllib.request.Request(f'https://{APP}-dsn.algolia.net/1/indexes/{INDEX}/query', data=json.dumps({'query': q, 'hitsPerPage': n}).encode(),
        headers={'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': KEY, 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=20))
out = []
for i, t in enumerate(T):
    try:
        j = query(t['term'])
        hits = []
        for h in j.get('hits', []):
            hits.append({'name': h.get('NAME'), 'brand': h.get('BRAND'), 'pack': h.get('PACK_SIZE'), 'prices': h.get('PRICES'), 'stock': h.get('STOCK'), 'status': h.get('STATUS'), 'online': h.get('DISPLAY_ONLINE'), 'id': h.get('objectID')})
        out.append({'id': t['id'], 't': t['term'], 'r': hits})
    except Exception as e:
        out.append({'id': t['id'], 't': t['term'], 'err': str(e)})
    if i % 40 == 0: print(i, t['id'], len(out[-1].get('r', [])))
    time.sleep(0.15)
json.dump(out, open(os.path.join(HERE, 'dumps/asda.json'), 'w'), indent=0)
print(len(out), 'terms;', sum(1 for o in out if o.get('err')), 'errors;', sum(1 for o in out if not o.get('r')), 'empty')
print('sample PRICES:', json.dumps(out[3]['r'][0]['prices'] if out[3].get('r') else None)[:600])
