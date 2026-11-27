import json, re, urllib.parse
C = json.load(open('candidates.json')); byterm = {c['term']: c for c in C}
aldi = json.load(open('aldi.txt')); tesco = json.load(open('tesco.txt')); sains = json.load(open('sains.json'))
asda = json.loads(urllib.parse.parse_qs(open('asda.txt').read())['data'][0]); json.dump(asda, open('asda.json','w'))
BAD = re.compile(r'\b(burger|nugget|wrap|fries|bites|ready|meal|pudding|sandwich|pie|pizza|curry|bolognese|carbonara|kiev|goujon|crisps|dip|soup|smoothie|juice|dessert|cake|cereal|ice cream|flavou?red|stuffed|coated|breaded|battered|in sauce|pasty|quiche|lasagne$|marinated|glazed|salad$|pot$|snack|bar$|bars$|toastie|melts?|balls|cookie|biscuit|muffin|pancake|drink|milkshake|yogurt drink|kit\b)\b', re.I)
EACH_G = dict(sausages=57, bagels=85, naan=130, crumpets=40, weetabix=18, rice_cakes=8, oatcakes=10, crackers=7, hash_browns=45, onion=150, red_onion=150, spring_onion=15, garlic=50, chilli=10, tomatoes=100, courgette=200, aubergine=300, leek=200, celery=400, lettuce=500, cabbage=900, cauliflower=800, butternut=1000, lime=60, apples=150, oranges=180, mango=400, pineapple=900, kiwi=75, bay_leaves=0.2, stock_pots=28, protein_bar=55, crackers_ryvita=10, pizza_base=150, tortilla_wraps_mini=30, rice_paper=10, nori=3, beef_burgers=113, chicken_burgers=100, eggs_free_range=60, fish_fingers=28, cheese_slices=20)
STOP = {'tin','jar','fresh','frozen','in','tomato','sauce','of','cooked','dry','ground','dried','steaks','fillets','slices','pots','pack','no','added','sugar','table','mini','instant','roasted','pitted','milled','free','range','medjool','sun'}
def words_of(term): return [w for w in re.findall(r'[a-z]+', term.lower()) if w not in STOP]
def size_of(name):
    m = re.search(r'(\d+(?:\.\d+)?)\s?(kg|g|l|ml|litre|ltr)\b', name, re.I); count = None
    mc = re.search(r'\bx\s?(\d+)\b|\b(\d+)\s?(?:pack|pk|pieces|sheets)\b|\b(\d+)\s(?:sausages|bagels|naan|crumpets|eggs|rolls|slices|pitta|wraps|tortillas|burgers|fingers|bags|nori|each)\b', name, re.I)
    if mc: count = int(next(g for g in mc.groups() if g))
    mx = re.search(r'(\d+)\s?x\s?(\d+(?:\.\d+)?)\s?(g|ml)\b', name, re.I)  # 4x145g
    if mx: return (int(mx.group(1))*float(mx.group(2)), 'g' if mx.group(3).lower()=='g' else 'ml', int(mx.group(1)))
    if not m: return (None, None, count)
    v = float(m.group(1)); u = m.group(2).lower()
    if u == 'kg': return (v*1000, 'g', count)
    if u == 'g': return (v, 'g', count)
    if u in ('l','litre','ltr'): return (v*1000, 'ml', count)
    return (v, 'ml', count)
def aldi_products(lines):
    out = []
    for ln in lines:
        p = [x.strip() for x in ln.split('|')]
        if len(p) < 5: continue
        m = re.match(r'£\s?(\d+\.\d\d)', p[-1]);
        if not m: continue
        name = p[1]; st = p[2]; ms = re.match(r'([\d.]+)\s*(KG|G|L|ML|Each)', st, re.I)
        size = unit = count = None
        if ms:
            v = float(ms.group(1)); u = ms.group(2).lower()
            if u == 'kg': size, unit = v*1000, 'g'
            elif u == 'g': size, unit = v, 'g'
            elif u == 'l': size, unit = v*1000, 'ml'
            elif u == 'ml': size, unit = v, 'ml'
            else: count = int(v)
        s2, u2, c2 = size_of(name)
        if not size and s2: size, unit = s2, u2
        if not count and c2: count = c2
        out.append(dict(name=name, price=float(m.group(1)), size=size, unit=unit, count=count, own=p[0] in ('EVERYDAY ESSENTIALS','ASHFIELDS','MEREVALE','THE FISHMONGER','CUCINA','WORLDWIDE FOODS','BRAMWELLS','THE PANTRY','STONEMILL','NATURE\'S PICK','COWBELLE','EMPORIUM','BRIDGE','VILLAGE BAKERY','HARVEST MORN','FOUR SEASONS','SOLESTA','BON APPETIT','NEWGATE','GRANDESSA','SNACKRITE','BELMONT','MOSER ROTH','THE DELI','DAIRYFINE','DIPLOMAT','ALCAFE','VEGAN','ROMAN ESTATE','CORALE','HAPPY HARVEST','FOODIE MARKET','BILASH','ASIA SPECIALITIES','THE FOODIE MARKET','SPECIALLY SELECTED')))
    return out
def tesco_products(lines):
    out = []
    for ln in lines:
        parts = [p.strip() for p in ln.split('|')]
        name = next((p for p in parts if re.search(r'\d\s?(g|kg|ml|l|pack|pk|G|KG|ML|L|Pack)\b', p) and re.search(r'[A-Za-z]{3}', p) and not re.match(r'^[£(]', p) and 'Clubcard' not in p and 'Offer' not in p and 'Price Match' not in p and 'Quantity' not in p), None)
        if not name: continue
        idx = parts.index(name); price = None
        for p in parts[idx+1:]:
            m = re.match(r'^£(\d+\.\d\d)$', p)
            if m: price = float(m.group(1)); break
        if price is None: continue
        size, unit, count = size_of(name)
        out.append(dict(name=name, price=price, size=size, unit=unit, count=count, own=name.lower().startswith('tesco')))
    return out
def asda_products(lines):
    out = []
    for ln in lines:
        parts = [p.strip() for p in ln.split('|')]
        name = next((p for p in parts if re.search(r'[A-Za-z]{3}', p) and len(p) > 8 and not re.match(r'^[£(]', p) and not re.match(r'^\d', p) and p not in ('Add','Dietary & Lifestyle','Category','Off To Uni')), None)
        if not name: continue
        idx = parts.index(name); price = None
        for p in parts[idx+1:]:
            m = re.match(r'^£(\d+\.\d\d)$', p)
            if m: price = float(m.group(1)); break
        if price is None: continue
        size, unit, count = size_of(name)
        if not size and parts and re.match(r'^\d', parts[0]): size, unit, _ = size_of(parts[0])
        out.append(dict(name=name, price=price, size=size, unit=unit, count=count, own=name.lower().startswith('asda') or 'just essentials' in name.lower()))
    return out
def sains_products(rows):
    out = []
    for name, price, up in rows:
        if not price: continue
        size, unit, count = size_of(name)
        out.append(dict(name=name, price=float(price), size=size, unit=unit, count=count, own=name.lower().startswith("sainsbury") or 'stamford street' in name.lower() or 'hubbard' in name.lower()))
    return out
RULES = {
 'fish_fingers': (r'fish finger', r'chocolate'), 'sour_cream': (r'soured cream', None), 'egg_whites': (r'egg white', r'tagliatelle|powder'), 'almond_milk': (r'almond', r'chocolate|barista'),
 'cheese_slices': (r'cheese slices|slices', r'grated'), 'jasmine_rice': (r'jasmine', r'micro|ready|sticky'), 'brown_rice': (r'brown (basmati )?rice|wholegrain rice', r'onion|micro'), 'microwave_rice': (r'micro', None),
 'couscous': (r'couscous', r'moroccan|fruity|mediterranean|spiced|giant|flavour'), 'quinoa': (r'quinoa', r'&|and|bulgur|pumpkin|mix|pouch|rice'), 'bulgur': (r'bulgur', r'quinoa|fruit'), 'weetabix': (r'weetabix', r'mini|choc|crispy'),
 'crackers': (r'cream cracker', r'custard'), 'onion': (r'brown onion|^onions|onions \d|onions$', r'red|spring|powder|granul|pickled'), 'garlic': (r'garlic', r'granul|paste|bread|butter|powder|puree|sauce|naan|salt|mayo'), 'ginger': (r'ginger', r'nut|biscuit|ground|beer|ale|sauce|stir|paste'),
 'chilli': (r'chill', r'lentil|flakes|powder|sauce|con|chopped|jar'), 'tomatoes': (r'tomato', r'chopped|tin|puree|sauce|ketchup|dried|passata'), 'aubergine': (r'aubergine', r'meze|chargrilled|baby'), 'rocket': (r'rocket', r'lolly|lollies|chill|ice'),
 'salad_bag': (r'salad', r'bean|potato|pasta|rice|coleslaw|cream|dressing|couscous'), 'cabbage': (r'cabbage', None), 'cauliflower': (r'cauliflower', r'&|and|cheese|rice|steak'), 'green_beans': (r'green bean', r'tin|water'), 'lime': (r'^limes?\b|limes', r'cordial|yogurt|granola|juice|coriander|chilli'),
 'coriander': (r'coriander', r'houmous|hummus|naan|ground|seed|sauce|lemon'), 'basil': (r'basil', r'sauce|pesto|passata|tomato|oil'), 'mint': (r'mint', r'sauce|mouth|corsodyl|tenderstem|choc|imperial|jelly|tea'), 'frozen_spinach': (r'spinach', r'baby|ricotta|pie|&|and'),
 'frozen_broccoli': (r'broccoli', r'tenderstem|&|and|stir|cheese'), 'edamame': (r'edamame', r'stir|roasted|crunch|&'), 'pineapple': (r'pineapple', r'juice|apple,|grape|chunks|melon|tin|rings|slices'), 'blueberries': (r'blueberr', r'frozen|muffin|yog|jam'), 'raspberries': (r'raspberr', r'frozen|&|and|jam|yog'),
 'frozen_mixed_berries': (r'berr', r'goji|seed|blackberries|vegetable|black forest'), 'coconut_cream': (r'coconut cream|creamed coconut', r'shower|yog|hair|body|milk'), 'hot_sauce': (r'hot sauce|hot chilli sauce|hot pepper sauce', r'peanut|nut'), 'fish_sauce': (r'fish sauce', r'cake'),
 'harissa': (r'harissa', r'chickpea|bowl|slow|chicken|houmous|hummus|paste$'), 'hummus': (r'houmous|hummus', r'chips|crisps|topped|flavour'), 'rice_vinegar': (r'rice vinegar|rice wine vinegar', r'cake|malt|distilled|flavour'), 'salt': (r'salt', r'peanut|nut|crisps|chips|sodium|rock|flakes|sea|garlic|celery|onion|pepper'),
 'black_pepper': (r'black pepper', r'mayo|sauce|crisps|corn'), 'onion_powder': (r'onion powder|onion granules', r'baking|chutney|crispy|salt'), 'oregano': (r'oregano', r'passata|sauce'), 'thyme': (r'thyme', r'tuna|chicken|chestnut|seasoning|fusions|stuffing'), 'rosemary': (r'rosemary', r'focaccia|potato|bisto|mix|sausage'),
 'garam_masala': (r'garam', r'sauce'), 'ground_coriander': (r'ground coriander|coriander ground', r'naan'), 'smoked_paprika': (r'smoked paprika', r'sauce|dolmio'), 'chilli_flakes': (r'chilli flakes|crushed chill', r'bran'), 'five_spice': (r'5 spice|five spice', r'chicken|pork'), 'cayenne': (r'cayenne', r"frank|sauce|mixed peppers"),
 'taco_seasoning': (r'taco', r'bean|shell|kit|kits'), 'ground_ginger': (r'ground ginger|ginger ground', r'nut|fresh'), 'italian_seasoning': (r'italian (herb|season)', r'salami|aromat|knorr'), 'brown_sugar': (r'brown (soft )?sugar|soft brown|light brown|dark brown', r'onion'),
 'maple_syrup': (r'maple syrup', r'bar|bacon|sausage|granola|pancake'), 'dark_chocolate': (r'dark chocolate', r'digestive|riesen|toffee|biscuit|cookie|chunks|chips|buttons'), 'almonds': (r'almond', r'granola|milk|butter|flaked|ground'), 'cashews': (r'cashew', r'&|and|cranberr'),
 'pumpkin_seeds': (r'pumpkin seed', r'quinoa|mix|&'), 'sesame_seeds': (r'sesame seed', r'grissini|bread|stick'), 'panko': (r'panko', r'nugget|chicken'), 'stock_pots': (r'stock pot', r'cube'), 'coconut_oil': (r'coconut oil', r'cheese|carex|hand|wash|hair|body|vegan'),
 'green_lentils': (r'green lentil|puy lentil', r'water|tin|can'), 'protein_bar': (r'protein', r'granola|yog|milk|pasta|bread|shake|powder'), 'peanuts': (r'peanuts', r'butter|choc|honey'), 'popcorn': (r'popcorn', r'share|sweet|salty|toffee|butter'),
 'squash': (r'squash', r'quadruple|double|cherries|butternut'), 'pizza_base': (r'pizza base', r'pepperoni|loyd|flame|sourdough'), 'puff_pastry': (r'puff pastry', r'slice|ham|cheese|sausage|pie'), 'filo': (r'filo', r'puff|slice'), 'rice_paper': (r'rice paper', r'rolling|baking|basmati|ocb'),
 'sushi_rice': (r'sushi rice', r'platter|fish'), 'nori': (r'nori', r'lasagne'), 'miso': (r'miso', r'salmon|soup'), 'gochujang': (r'gochujang', r'tender|chicken|kit|rice'), 'sriracha_mayo': (r'sriracha mayo', r'hot chilli sauce'), 'chorizo': (r'chorizo', r'paella|pizza|pasta|&|and'),
 'chicken_burgers': (r'chicken (breast )?burger', r'quarter'), 'beef_burgers': (r'beef burger|beef steak burger|smash', r'organic|yeo'), 'tea': (r'tea bags', r'green|fruit|herbal'), 'sparkling_water': (r'sparkling', r'flavour|lemon|lime|6 ?x|6x'), 'oat_milk': (r'oat', r'biscuit|cake|granola'),
 'crumpets': (r'crumpet', None), 'tinned_potatoes': (r'potatoes in water|new potatoes', r'baby|salad'), 'sweet_soy': (r'ketjap|kicap|kecap', None), 'oat_milk': (r'oat drink|oat milk|oatly', r'biscuit|cake|granola|porridge|barista|chocolate'), 'worcestershire': (r'worcester', None), 'couscous': (r'couscous', r'moroccan|fruity|mediterranean|spiced|giant|flavour|roasted|vegetable|harriott|pot|salad'), 'lettuce': (r'iceberg', None), 'celery': (r'celery', r'salt'), 'leek': (r'leek', r'sliced|soup'), 'courgette': (r'courgette', r'organic'), 'granola': (r'granola', r'protein|chocolate|bar'), 'mango': (r'mango', r'melon|chunks|chutney|juice|smoothie'),
 'apples': (r'apple', r'juice|pink lady|organic|sauce|pie|crumble'), 'oranges': (r'orange', r'juice|taste the|blood|squash'), 'dates': (r'dates', r'medjool'), 'raisins': (r'raisin', r'granola|choc|yogurt'), 'olives': (r'olive', r'oil|stuffed|garlic'),
 'feta': (r'feta', r'salad|barrel|organic'), 'mozzarella': (r'mozzarella', r'grated|sticks|bites'), 'greek_yoghurt': (r'greek', r'fage|0%|fat free|flavour|honey'), 'natural_yoghurt': (r'natural', r'greek|fat free|flavour'), 'cream_cheese': (r'soft cheese|cream cheese', r'philadelphia|garlic|herb|chive'),
 'white_potatoes': (r'white potato', r'organic|baby|salad'), 'lamb_mince': (r'lamb mince|minced lamb', r'hotpot|organic|ready'), 'tofu': (r'tofu', r'xl|smoked|marinated'), 'smoked_salmon': (r'smoked salmon', r'skin on|hot|trimmings'), 'sardines_tin': (r'sardine', r'finest|paprika'),
 'jalapenos': (r'jalapeno', r'houmous|hummus|cheese|pepper'), 'gherkins': (r'gherkin', r'cornichon|herb|baby'), 'egg_noodles': (r'egg noodle', r'free range'), 'baked_beans': (r'baked beans', r'4 x|x 4|sausage|branston'), 'cannellini': (r'cannellini', None), 'sweetcorn_tin': (r'sweetcorn', r'frozen|1kg|cob'), 'turkey_breast': (r'turkey breast', r'slices|joint|mince'),
}
def pick(term, cand, prods):
    words = words_of(term); best = None
    rule = RULES.get(cand['id'])
    for p in prods:
        nm = p['name'].lower(); hits = sum(1 for w in words if w.rstrip('s') in nm)
        if rule:
            if not re.search(rule[0], nm): continue
            if rule[1] and re.search(rule[1], nm): continue
        elif hits < len(words): continue
        if BAD.search(nm) and not BAD.search(term): continue
        # convert to candidate unit
        size = None
        if cand['unit'] == 'each':
            if p['count']: size = p['count']
            elif p['size'] and cand['id'] in EACH_G: size = round(p['size'] / EACH_G[cand['id']], 1)
        else:
            if p['size'] and p['unit'] == cand['unit']: size = p['size']
            elif p['size'] and {'g','ml'} == {p['unit'], cand['unit']}: size = p['size']  # treat g/ml as equal for sauces etc
        if not size: continue
        per = p['price'] / size
        score = (hits, 1 if p['own'] else 0, -per)
        if best is None or score > best[0]: best = (score, dict(name=p['name'], size=size, price=p['price']))
    return best[1] if best else None
DROP = {('almond_milk','aldi'),('cheese_slices','sainsburys'),('bulgur','tesco'),('garlic','asda'),('ginger','sainsburys'),('chilli','asda'),('aubergine','sainsburys'),('mint','aldi'),('mint','asda'),('pineapple','aldi'),('pineapple','asda'),('frozen_mixed_berries','asda'),('salt','aldi'),('salt','tesco'),('rosemary','aldi'),('popcorn','sainsburys'),('feta','aldi'),('mozzarella','aldi'),('natural_yoghurt','sainsburys'),('sesame_seeds','sainsburys'),('jalapenos','asda'),('couscous','tesco'),('couscous','sainsburys')}
FIX = {('stock_pots','aldi'): 4, ('nori','tesco'): 5, ('lettuce','tesco'): 1, ('lettuce','asda'): 1, ('lettuce','sainsburys'): 1}
merged = {}
for c in C:
    t = c['term']; packs = []
    for shop, data, fn in (('aldi', aldi, aldi_products), ('tesco', tesco, tesco_products), ('asda', asda, asda_products), ('sainsburys', sains, sains_products)):
        e = next((x for x in data if x['t'] == t), None)
        if not e or not e.get('r'): continue
        p = pick(t, c, fn(e['r']))
        if p and (c['id'], shop) not in DROP: packs.append(dict(shop=shop, name=p['name'], size=FIX.get((c['id'], shop), p['size']), price=p['price'], checked='2026-09-13'))
    merged[c['id']] = dict(id=c['id'], name=c['name'], unit=c['unit'], protein=c['protein'], kcal=c['kcal'], category=c['category'], packs=packs)
json.dump(merged, open('merged.json','w'), indent=1)
n4 = sum(1 for m in merged.values() if len(m['packs']) == 4); n0 = sum(1 for m in merged.values() if not m['packs'])
print(len(merged), 'items;', n4, 'priced at all 4;', n0, 'unpriced:', [k for k,m in merged.items() if not m['packs']])
for k, m in merged.items():
    print(f"{k:22} " + ' ; '.join(f"{p['shop'][:2]}:{p['name'][:34]}={p['size']}@{p['price']}" for p in m['packs']))
