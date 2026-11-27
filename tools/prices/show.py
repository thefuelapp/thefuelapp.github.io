import sys, json, importlib.util
sys.argv = ['refresh.py']; spec = importlib.util.spec_from_file_location('r', 'refresh.py'); r = importlib.util.module_from_spec(spec)
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()): spec.loader.exec_module(r)
def show(iid, shop, n=30):
    it = next(i for i in r.items if i['id'] == iid)
    print(f"--- {iid} @ {shop}  unit={it['unit']}  existing:", [(p['name'], p['size'], p['price']) for p in it['packs'] if p['shop'] == shop])
    for p in r.prods[shop].get(iid, [])[:n]: print(f"   {p['price']:6.2f}  size={r.pack_size_in_unit(p, it['unit'], iid)}  own={int(p['own'])}  {p['name'][:80]}")
