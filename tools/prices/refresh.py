# Price refresh (14 Sep 2026): reads the scrape dumps in dumps/ (aldi_*.txt, tesco_*.txt, sainsburys_*.txt from runner
# chunks; asda.json from asda_algolia.py), matches every existing pack in app/data/ingredients.json by size + name,
# proposes a pack for every (ingredient, shop) gap, and writes dumps/refresh_report.txt + dumps/proposed.json.
# Nothing touches the app until proposed.json is reviewed and applied with apply.py.
#
# Matching rule for an existing pack: candidates must have the same size in the ingredient's unit (±2%); then an exact
# word-set match wins, else the old name's words must all appear in the new name; if several still qualify the one with
# the same price as before wins, otherwise the pack is flagged AMBIGUOUS. A pack with no qualifying candidate is STALE
# (dropped) and a replacement is proposed like any other gap. Every FILL/STALE/AMBIGUOUS line is meant to be read by a
# person before apply.py runs.
import json, re, glob, os
HERE = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(HERE, 'dumps')
ING = os.path.join(HERE, '../../app/data/ingredients.json')
import datetime
TODAY = os.environ.get('FUEL_TODAY') or datetime.date.today().isoformat()   # the day the prices were read
SHOPS = ['aldi', 'tesco', 'asda', 'sainsburys']
data = json.load(open(ING)); items = data['items']
terms = {t['id']: t['term'] for t in json.load(open(os.path.join(D, 'terms.json')))}
overrides = json.load(open(os.path.join(D, 'overrides.json'))) if os.path.exists(os.path.join(D, 'overrides.json')) else {}

# ---- size parsing -------------------------------------------------------------------------------------------------
# grams per "each" for ingredients counted by the piece, so a pack sold by weight can be expressed in pieces
EACH_G = dict(sausages=57, bagels=85, naan=130, crumpets=40, weetabix=18, rice_cakes=8, oatcakes=10, crackers=7, hash_browns=45, onion=150, red_onion=150, spring_onion=15, garlic=50, chilli=10, tomatoes=100, courgette=200, aubergine=300, leek=200, celery=400, lettuce=500, cabbage=900, cauliflower=800, butternut=1000, lime=60, apples=150, oranges=180, mango=400, pineapple=900, kiwi=75, bay_leaves=0.2, stock_pots=28, protein_bar=55, crackers_ryvita=10, pizza_base=150, tortilla_wraps_mini=30, rice_paper=10, nori=3, beef_burgers=113, chicken_burgers=100, eggs_free_range=60, egg=60, fish_fingers=28, cheese_slices=20, bread=40, wrap=64, pitta=60, cucumber=400, avocado=170, banana=120, lemon=100, pepper=160, stock_cube=10, corn_tortilla=25)
def size_of(name):
    """(amount, 'g'|'ml', count) parsed from a product name like 'Tesco Penne 1Kg', 'Free Range Eggs 6 Pack' or '4x145g'."""
    n = name.replace('Litre', 'l').replace('litre', 'l').replace(',', '').replace('×', 'x')
    mp = re.search(r'(\d+(?:\.\d+)?)\s?(?:pints?|pt)\b', n, re.I)  # milk: 4 pints
    if mp: return (round(float(mp.group(1)) * 568), 'ml', None)
    mx = re.search(r'(\d+)\s?x\s?(\d+(?:\.\d+)?)\s?(g|ml|kg|l)\b', n, re.I)  # 4x145g
    if mx:
        v = float(mx.group(2)); u = mx.group(3).lower(); k = int(mx.group(1))
        return (k * v * (1000 if u in ('kg', 'l') else 1), 'ml' if u in ('ml', 'l') else 'g', k)
    m = re.search(r'(\d+(?:\.\d+)?)\s?(kg|g|l|ml|ltr)\b', n, re.I)
    count = None
    mc = re.search(r'\bx\s?(\d+)\b|\b(\d+)\s?x\b|\b(\d+)\s?(?:pack|pk|pieces|sheets|each|pcs)\b|\b(\d+)\s(?:sausages|bagels|naan|crumpets|eggs|rolls|slices|pitta|pittas|wraps|tortillas|burgers|fingers|bags|nori|large|medium|mixed|bananas|avocados|lemons|limes|peppers|steaks|fillets)\b', n, re.I)
    if mc: count = int(next(g for g in mc.groups() if g))
    if not m: return (None, None, count)
    v = float(m.group(1)); u = m.group(2).lower()
    if u == 'kg': return (v * 1000, 'g', count)
    if u == 'g': return (v, 'g', count)
    if u in ('l', 'ltr'): return (v * 1000, 'ml', count)
    return (v, 'ml', count)

ALDI_OWN = {'EVERYDAY ESSENTIALS', 'ASHFIELDS', 'MEREVALE', 'THE FISHMONGER', 'CUCINA', 'WORLDWIDE FOODS', 'BRAMWELLS', 'THE PANTRY', 'STONEMILL', "NATURE'S PICK", 'COWBELLE', 'EMPORIUM', 'BRIDGE', 'VILLAGE BAKERY', 'HARVEST MORN', 'FOUR SEASONS', 'SOLESTA', 'BON APPETIT', 'NEWGATE', 'GRANDESSA', 'SNACKRITE', 'BELMONT', 'MOSER ROTH', 'THE DELI', 'DAIRYFINE', 'DIPLOMAT', 'ALCAFE', 'VEGAN', 'ROMAN ESTATE', 'CORALE', 'HAPPY HARVEST', 'FOODIE MARKET', 'BILASH', 'ASIA SPECIALITIES', 'THE FOODIE MARKET', 'SPECIALLY SELECTED', 'EE', 'ASHFIELD FARM', 'OAKHURST', 'GASTRO B', 'LACURA', 'BAKERS LIFE', 'INSPIRED CUISINE', 'PLANT MENU', 'SEA QUEEN', 'BROOKLEA', 'THE JUICE CO', 'CRESTWOOD', 'CHEF SELECT', 'SIMPLY NATURE', 'GIANNIS', "GIANNI'S", 'SIMPLY', 'MAMIA', 'CARLOS', 'TROPICAL SUN', 'BRAMWELL', 'READY, SET…COOK!', 'ASIA GREEN GARDEN', 'BARISSIMO', 'THE JUICE COMPANY', 'ORGANIC', 'SPECIALLY SELECTED ORGANIC', 'SNACK RITE', 'VIVE', 'SEA QUEEN', 'CORALE', 'DAIRYFINE', 'SAVOUR BAKES', 'CHOCEUR', 'HOLLY LANE', 'KAVANAGHS', 'GREYSON', 'HIGHLAND EARL', 'THE FISHMONGER', 'BAKEHOUSE', 'PLANT MENU', 'FOODIE MARKET', 'RAWVELO'}
ALDI_MARKERS = {'while stock lasts', 'new', 'only at aldi', 'super 6', 'super six', 'specialbuy', 'aldi price', 'online exclusive'}
def tc(s): return ' '.join(w.capitalize() if w.lower() not in ('uht', 'bbq') else w.upper() for w in s.lower().split())
SIZE_RE = re.compile(r'^([\d.,]+)\s*(KG|G|L|ML|Each|Pack|Pair|Pairs)$', re.I)
def aldi_size(st):
    """('1,000 ML' -> (1000,'ml',None)); ('6 Each' -> (None,None,6))"""
    m = SIZE_RE.match(st)
    if not m: return (None, None, None)
    v = float(m.group(1).replace(',', '')); u = m.group(2).lower()
    if u == 'kg': return (v * 1000, 'g', None)
    if u == 'g': return (v, 'g', None)
    if u == 'l': return (v * 1000, 'ml', None)
    if u == 'ml': return (v, 'ml', None)
    return (None, None, int(v))
def aldi_size_str(st):
    size, unit, count = aldi_size(st)
    if count: return '%d Pack' % count
    if size is None: return st
    if unit == 'g': return ('%dkg' % (size / 1000)) if size >= 1000 and size % 1000 == 0 else '%dg' % round(size)
    return ('%dl' % (size / 1000)) if size >= 1000 and size % 1000 == 0 else '%dml' % round(size)

def load_chunks(shop):
    out = {}
    for f in sorted(glob.glob(os.path.join(D, shop + '_*.txt'))):
        for e in json.loads(open(f).read()): out[e['id']] = e.get('r') or []
    return out

def parse_aldi(rows):
    P = []
    for r in rows:
        si = next((i for i, x in enumerate(r) if SIZE_RE.match(x.strip())), None)
        if si is None or si < 1: continue
        name = r[si - 1]; brand = r[si - 2] if si >= 2 and r[si - 2].lower() not in ALDI_MARKERS else ''
        prices = [float(x[1:]) for x in r[si + 1:] if re.match(r'^£\d+\.\d\d$', x.strip())]
        if not prices: continue
        price = prices[0]  # with a 'Save x%' line the first £ is the current shelf price, the second the old one
        size, unit, count = aldi_size(r[si])
        s2, u2, c2 = size_of(name)
        if size is None and s2: size, unit = s2, u2
        if count is None and c2: count = c2
        full = name if re.search(r'\d\s?(g|kg|ml|l|pack)\b', name, re.I) else name + ' ' + aldi_size_str(r[si])
        if brand and brand.lower() not in full.lower(): full = tc(brand) + ' ' + full
        P.append(dict(name=full, price=price, size=size, unit=unit, count=count, own=brand.upper() in ALDI_OWN, brand=brand))
    return P

def parse_tesco(rows):
    P = []
    for r in rows:
        name = next((p for p in r if re.search(r'\d\s?(g|kg|ml|l|pack|pk|G|KG|ML|L|Pack|Litre|litre|Ml)\b', p) and re.search(r'[A-Za-z]{3}', p) and not re.match(r'^[£(]', p) and 'Clubcard' not in p and 'Offer' not in p and 'Price Match' not in p and 'Quantity' not in p and 'delivery' not in p), None)
        if not name: continue
        idx = r.index(name); price = next((float(p[1:]) for p in r[idx + 1:] if re.match(r'^£\d+\.\d\d$', p)), None)
        if price is None: continue
        size, unit, count = size_of(name)
        P.append(dict(name=name, price=price, size=size, unit=unit, count=count, own=name.lower().startswith('tesco'), brand=''))
    return P

def parse_sains(rows):
    P = []
    for name, price, up, nectar in rows:
        if not price: continue
        size, unit, count = size_of(name)
        P.append(dict(name=name, price=float(price), size=size, unit=unit, count=count, own=name.lower().startswith("sainsbury") or 'stamford street' in name.lower() or 'hubbard' in name.lower(), brand=''))
    return P

def parse_asda(rows):
    P = []
    for h in rows:
        pr = (h.get('prices') or {}).get('EN') or {}
        price = pr.get('PRICE')
        if price is None or h.get('status') not in (None, 'A') or h.get('online') is False: continue
        name = h['name'] or ''; brand = h.get('brand') or ''; pack = h.get('pack') or ''
        if not re.search(r'\d\s?(g|kg|ml|l|pk|pack)\b', name, re.I) and pack:
            name = name + ' ' + pack.lower().replace('pk', ' Pack').replace('x', ' x ')
        full = name if brand.lower() in name.lower() else brand + ' ' + name
        size, unit, count = size_of(full)
        if not size:
            s2, u2, c2 = size_of(pack.lower().replace('pk', ' pack')); size, unit = s2, u2; count = count or c2
        P.append(dict(name=re.sub(r'\s+', ' ', full).strip(), price=float(price), size=size, unit=unit, count=count, own='ASDA' in brand.upper() or 'ESSENTIALS' in brand.upper(), brand=brand))
    return P

raw = {'aldi': load_chunks('aldi'), 'tesco': load_chunks('tesco'), 'sainsburys': load_chunks('sainsburys'),
       'asda': {e['id']: e.get('r') or [] for e in json.load(open(os.path.join(D, 'asda.json')))}}
PARSE = {'aldi': parse_aldi, 'tesco': parse_tesco, 'sainsburys': parse_sains, 'asda': parse_asda}
prods = {s: {i: PARSE[s](rows) for i, rows in raw[s].items()} for s in SHOPS}
# a shop whose scrape is incomplete (fewer than 80% of terms returned anything) is left exactly as it was
DONE = [s for s in SHOPS if sum(1 for i in terms if raw[s].get(i)) >= 0.8 * len(terms)]
print('refreshing', DONE, '- untouched:', [s for s in SHOPS if s not in DONE])

# ---- matching existing packs --------------------------------------------------------------------------------------
STOP = {'the', 'and', 'british', 'fresh', 'pack', 'each', 'x', 'a', 'of', 'in', 'with', 'by', 'co', 'pk', 'or', 'irish', 'skinless', 'boneless', 'aldi', 'asda', 'tesco', 'sainsbury', 'sainsburys', 'juice', 'water', 'brine', 'unwaxed', 'inspired', 'to', 'cook'}
OWN_PREFIX = re.compile(r"^(asda|sainsbury|stamford street|just essentials|cook by asda|bake by asda|the bakery at asda|plant based by asda|exceptional by asda|extra special|tesco|hubbard)", re.I)
import unicodedata
def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()  # Purée -> Puree
    return re.sub(r'[^a-z0-9]+', ' ', s.lower().replace('&', ' and ').replace("'", '')).strip()
def sizekey(s):
    s = re.sub(r'\((.*?)\)', ' ', s.replace('×', 'x'))  # drop annotations like (frozen), (~20 slices), (240g drained)
    s = re.sub(r'(\d+)\s?x\s?(\d)', r'\1 x \2', s)  # 12x10g -> 12 x 10g so the count survives as its own word
    s = re.sub(r'\bx\s?(\d+)\b', r'\1', s); s = re.sub(r'\b(\d+)\s?x\b', r'\1', s)  # x6, 6x -> 6
    s = re.sub(r'\b(\d+(?:\.\d+)?)\s?kg\b', lambda m: str(int(float(m.group(1)) * 1000)) + 'g', s, flags=re.I)
    s = re.sub(r'\b(\d+(?:\.\d+)?)\s?(l|litre|ltr)\b', lambda m: str(int(float(m.group(1)) * 1000)) + 'ml', s, flags=re.I)
    return s
def toks(s): return {w.rstrip('s') if len(w) > 3 else w for w in norm(sizekey(s)).split() if w not in STOP and not re.match(r'^\d+(g|ml|pack|pk|each)$', w)}
def brand_ok(pack_name, p):
    """a shop own-brand pack must stay own-brand; otherwise the old name's first word (its brand, or for Aldi's brand-less
    old names just its first word) must reappear in the candidate"""
    if OWN_PREFIX.match(pack_name): return p['own']
    words = norm(pack_name).split()
    return not words or words[0] in norm(p['name']).split()
def pack_size_in_unit(p, unit, iid):
    """a parsed product's size in the ingredient's unit (g/ml/each), or None"""
    if unit == 'each':
        if p['count']: return p['count']
        if p['size'] and iid in EACH_G: return round(p['size'] / EACH_G[iid], 1)
        return 1  # one piece: a cucumber, a lettuce, or a single tin/jar whose name carries only a weight
    if p['size'] and (p['unit'] == unit or {p['unit'], unit} == {'g', 'ml'}): return p['size']
    return None
def same_size(pack, p, unit, iid):
    """size test: the size written in the old pack name (the 400g of a tin logged at 240g drained, the 145g of a tin
    counted as 1 each) beats the pack's stored size; otherwise the stored size in the ingredient's unit"""
    ns, nu, nc = size_of(re.sub(r'\((.*?)\)', ' ', pack['name']))
    if ns and p['size'] and (p['unit'] == nu or {p['unit'], nu} == {'g', 'ml'}) and abs(ns - p['size']) <= 0.02 * max(ns, p['size']): return True
    sz = pack_size_in_unit(p, unit, iid)
    return bool(pack.get('size')) and sz is not None and abs(sz - pack['size']) <= 0.02 * max(sz, pack['size'])
def match_existing(pack, cands, unit, iid):
    """(product, how) — how is 'exact' | 'subset' | 'price' | None; on None the second value is the ambiguous list"""
    seen = set(); uniq = []
    for p in cands:
        k = (norm(p['name']), p['price'])
        if k not in seen: seen.add(k); uniq.append(p)
    same = [p for p in uniq if same_size(pack, p, unit, iid) and brand_ok(pack['name'], p)]
    pt = toks(pack['name'])
    exact = [p for p in same if toks(p['name']) == pt]
    if len(exact) == 1: return exact[0], 'exact'
    sub = exact or [p for p in same if pt and pt <= toks(p['name'])]
    if len(sub) == 1: return sub[0], 'subset'
    if len(sub) > 1:
        sp = [p for p in sub if abs(p['price'] - pack['price']) < 0.005]
        if len(sp) == 1: return sp[0], 'price'
        pool = sp or sub
        extra = sorted(pool, key=lambda p: len(toks(p['name']) - pt))
        if len(toks(extra[0]['name']) - pt) < len(toks(extra[1]['name']) - pt): return extra[0], 'closest'
        return None, pool
    return None, []

BAD = re.compile(r'\b(burger|nugget|wrap|fries|bites|ready|meal|pudding|sandwich|pie|pizza|curry|bolognese|carbonara|kiev|goujon|crisps|dip|soup|smoothie|juice|dessert|cake|cereal|ice cream|flavou?red|stuffed|coated|breaded|battered|in sauce|pasty|quiche|lasagne$|marinated|glazed|salad$|pot$|snack|bar$|bars$|toastie|melts?|balls|cookie|biscuit|muffin|pancake|drink|milkshake|yogurt drink|kit\b|seasoned|spiced|tikka|granola|sachet|organic|taste the difference|finest|exceptional|specially selected|extra special|deluxe)\b', re.I)
TSTOP = {'tin', 'jar', 'fresh', 'frozen', 'in', 'tomato', 'sauce', 'of', 'cooked', 'dry', 'ground', 'dried', 'steaks', 'fillets', 'slices', 'pots', 'pack', 'no', 'added', 'sugar', 'table', 'mini', 'instant', 'roasted', 'pitted', 'milled', 'free', 'range', 'medjool', 'sun', 'spring', 'water', 'chunks', 'kit'}
def words_of(term): return [w for w in re.findall(r'[a-z]+', term.lower()) if w not in TSTOP]
def propose(it, shop):
    """cheapest sensible match for a gap, own-brand first; None when nothing fits"""
    cands = prods[shop].get(it['id'], []); words = words_of(terms.get(it['id'], it['name'])); best = None
    for p in cands:
        nm = p['name'].lower(); hits = sum(1 for w in words if w.rstrip('s') in nm)
        if hits < max(1, len(words) - (1 if len(words) > 2 else 0)): continue
        if BAD.search(nm) and not BAD.search(terms.get(it['id'], '')): continue
        sz = pack_size_in_unit(p, it['unit'], it['id'])
        if not sz: continue
        per = p['price'] / sz; score = (hits, 1 if p['own'] else 0, -per)
        if best is None or score > best[0]: best = (score, p, sz)
    if not best: return None
    _, p, sz = best
    return dict(shop=shop, name=p['name'], size=sz, price=p['price'], checked=TODAY)

report = []; stats = dict(same=0, changed=0, renamed=0, ambiguous=0, stale=0, filled=0, nofill=0, overridden=0)
def cand_str(p, unit, iid): return f"£{p['price']:.2f} {p['name'][:55]} [{pack_size_in_unit(p, unit, iid)}{unit}]"
new_items = []
for it in items:
    it2 = dict(it); packs = []; matched_shops = set(); had_shops = set()
    for pk in it.get('packs', []):
        had_shops.add(pk['shop'])
        if pk['shop'] not in DONE: packs.append(pk); continue
        key = f"{it['id']}|{pk['shop']}|{pk['name']}"
        if key in overrides:  # reviewer decision: {"drop": true} or {"name":..,"size":..,"price":..}
            o = overrides[key]; stats['overridden'] += 1
            if o.get('drop'): report.append(f"OVERRIDE {it['id']:22} {pk['shop']:10} dropped {pk['name'][:60]}"); continue
            np = dict(pk); np.update({k: o[k] for k in ('name', 'size', 'price') if k in o}); np['checked'] = o.get('checked', TODAY)  # an override may keep an older date (a product the site has stopped listing but the shop still sells)
            packs.append(np); matched_shops.add(pk['shop']); report.append(f"OVERRIDE {it['id']:22} {pk['shop']:10} {np['name'][:60]} £{np['price']:.2f}"); continue
        cands = prods[pk['shop']].get(it['id'], [])
        m, how = match_existing(pk, cands, it['unit'], it['id'])
        if m:
            np = dict(pk); np['price'] = m['price']; np['checked'] = TODAY; matched_shops.add(pk['shop'])
            if abs(m['price'] - pk['price']) > 0.004:
                stats['changed'] += 1; report.append(f"CHANGED  {it['id']:22} {pk['shop']:10} {pk['name'][:58]:58} £{pk['price']:.2f} -> £{m['price']:.2f}  ({how})")
            else: stats['same'] += 1
            if norm(m['name']) != norm(pk['name']):
                np['name'] = m['name']; stats['renamed'] += 1
                if how != 'exact': report.append(f"RENAMED  {it['id']:22} {pk['shop']:10} {pk['name'][:45]} => {m['name'][:60]}  ({how})")
            packs.append(np)
        elif how:  # ambiguous
            stats['ambiguous'] += 1
            report.append(f"AMBIG    {it['id']:22} {pk['shop']:10} {pk['name'][:50]} £{pk['price']:.2f} ~ " + ' | '.join(cand_str(p, it['unit'], it['id']) for p in how[:4]))
        else:
            stats['stale'] += 1
            report.append(f"STALE    {it['id']:22} {pk['shop']:10} {pk['name'][:58]:58} £{pk['price']:.2f}  ({len(cands)} results)")
    for shop in DONE:
        if shop in matched_shops or it['id'] == 'frozen_fruit': continue
        if f"{it['id']}|{shop}|fill" in overrides:
            o = overrides[f"{it['id']}|{shop}|fill"]; stats['overridden'] += 1
            if not o.get('drop'): packs.append(dict(shop=shop, name=o['name'], size=o['size'], price=o['price'], checked=TODAY)); report.append(f"OVERRIDE {it['id']:22} {shop:10} fill {o['name'][:60]} £{o['price']:.2f}")
            continue
        pr = propose(it, shop)
        tag = 'REFILL' if shop in had_shops else 'FILL'
        if pr:
            stats['filled'] += 1; packs.append(pr)
            report.append(f"{tag:8} {it['id']:22} {shop:10} {pr['name'][:58]:58} {pr['size']}{it['unit']} £{pr['price']:.2f}")
        else:
            stats['nofill'] += 1; report.append(f"NOFILL   {it['id']:22} {shop:10} ({len(prods[shop].get(it['id'], []))} results, none fit)")
    it2['packs'] = packs; new_items.append(it2)

open(os.path.join(D, 'refresh_report.txt'), 'w').write('\n'.join(sorted(report)) + '\n\n' + json.dumps(stats))
json.dump(new_items, open(os.path.join(D, 'proposed.json'), 'w'), indent=1)
print(stats)
