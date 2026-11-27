# Writes the reviewed dumps/proposed.json (from refresh.py) into app/data/ingredients.json, keeping every other key
# of each ingredient and of the file. Run only after dumps/refresh_report.txt has been read through.
#   python3 apply.py <shop> [<shop>...] ["new checkedNote text"]
# The shops named are the ones the refresh covered: an ingredient with no pack at one of them is marked
# `unavailable` there (the app shows "Not stocked"), and one that has a pack again loses the mark.
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ING = os.path.join(HERE, '../../app/data/ingredients.json')
data = json.load(open(ING)); proposed = {i['id']: i for i in json.load(open(os.path.join(HERE, 'dumps/proposed.json')))}
shops = [a for a in sys.argv[1:] if a in ('aldi', 'tesco', 'asda', 'sainsburys')]; note = next((a for a in sys.argv[1:] if a not in shops), None)
n = 0
for it in data['items']:
    p = proposed.get(it['id'])
    if not p: continue
    packs = [{k: v for k, v in pk.items() if k not in ('stale', 'proposed')} for pk in p['packs']]
    for pk in packs: pk['price'] = round(float(pk['price']), 2)
    if packs != it['packs']: it['packs'] = packs; n += 1
    have = {pk['shop'] for pk in packs}
    unavailable = [s for s in it.get('unavailable', []) if s not in shops] + [s for s in shops if s not in have and it['id'] != 'frozen_fruit']
    if unavailable: it['unavailable'] = sorted(set(unavailable))
    elif 'unavailable' in it: del it['unavailable']
if note: data['checkedNote'] = note
json.dump(data, open(ING, 'w'), indent=1, ensure_ascii=False); open(ING, 'a').write('\n')
print(n, 'ingredients updated')
