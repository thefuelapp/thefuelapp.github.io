// In-page price scraper (14 Sep 2026). Paste into the Browser pane's javascript tool while a tab is open on the shop's own site
// (aldi.co.uk, tesco.com or sainsburys.co.uk) so the fetches are same-origin. Reads dumps/terms.json from the dev server
// (FUEL_DUMP_DIR=tools/prices/dumps node serve.mjs), searches N terms from ST, and POSTs the raw result rows back to /_dump.
// ASDA is client-rendered, so it needs one navigation per term instead (see asda_gen.py).
// Change SHOP / ST / N per call; ~40 terms per call keeps each run under the tool timeout.
const B = 'http://localhost:8765';
const T = await (await fetch(B + '/_file?name=terms.json')).json();
const SHOP = 'aldi', ST = 0, N = 40; const terms = T.slice(ST, ST + N);
const lines = (d, t) => { const w = d.createTreeWalker(t, NodeFilter.SHOW_TEXT); const o = []; let n; while (n = w.nextNode()) { const s = n.textContent.trim(); if (s) o.push(s); } return o; };
const P = {
  aldi: async q => { const r = await fetch('/results?q=' + encodeURIComponent(q)); const d = new DOMParser().parseFromString(await r.text(), 'text/html'); return [...d.querySelectorAll('.product-tile')].slice(0, 40).map(t => lines(d, t)); },
  tesco: async q => { const r = await fetch('/groceries/en-GB/search?query=' + encodeURIComponent(q) + '&count=48'); const d = new DOMParser().parseFromString(await r.text(), 'text/html'); return [...d.querySelectorAll('li')].filter(l => /£\d/.test(l.textContent) && l.querySelector('a[href*="/products/"]')).map(t => lines(d, t)); },
  sainsburys: async q => { const r = await fetch('/groceries-api/gol-services/product/v1/product?filter[keyword]=' + encodeURIComponent(q) + '&page_size=24'); const j = await r.json(); return (j.products || []).map(p => [p.name, p.retail_price && p.retail_price.price, p.unit_price && (p.unit_price.price + '/' + p.unit_price.measure_amount + p.unit_price.measure), p.nectar_price ? 1 : 0]); },
};
const CONC = SHOP === 'tesco' ? 2 : 3;
const out = []; let i = 0;
await Promise.all(Array.from({ length: CONC }, async () => { while (i < terms.length) { const t = terms[i++]; try { out.push({ id: t.id, t: t.term, r: await P[SHOP](t.term) }); } catch (e) { out.push({ id: t.id, t: t.term, err: String(e) }); } } }));
await fetch(B + '/_dump?name=' + SHOP + '_' + ST, { method: 'POST', body: JSON.stringify(out) });
'ok ' + out.length + ' err ' + out.filter(x => x.err).length;
