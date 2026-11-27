# Price refresh tooling

How `app/data/ingredients.json` is priced, so it can be refreshed again. Last full refresh: 14 Sep 2026 (Aldi, ASDA, Sainsbury's; Tesco blocked that day, see below).

## The routine (about an hour, all from the Browser pane)

1. `dumps/terms.json` — one search term per ingredient (built from `candidates.json` plus the older items). Regenerate only if ingredients are added.
2. Start the dev server with the drop box on: `FUEL_DUMP_DIR=$PWD/tools/prices/dumps node serve.mjs` (from the repo root).
3. **Aldi, Tesco, Sainsbury's** run inside a tab open on the shop's own site (their CSP blocks fetches to localhost, so results ride out in `window.name`): `python3 gen2.py <shop> <start> 40` prints the javascript for one 40-term chunk; run it with the Browser pane's javascript tool, then navigate the tab to `http://localhost:8765/_relay?name=<shop>_<start>` which drops the results into `dumps/<shop>_<start>.txt`. Aldi and Tesco are server-rendered search pages parsed with DOMParser; Sainsbury's has a same-origin JSON API. Tesco's bot protection (Akamai) blocks the browser after ~40 rapid fetches — go slowly (one at a time, a couple of seconds apart) and stop if the tab title turns to "Error"; the block lasted hours on 14 Sep.
4. **ASDA** needs no browser: `python3 asda_algolia.py` queries the public Algolia search index the ASDA site uses (app id and search-only key are in every asda.com page) and writes `dumps/asda.json` in seconds.
5. `python3 refresh.py` matches every existing pack (same size in the ingredient's unit, then exact word set, then old words ⊆ new words, then same-price tie-break; anything else is AMBIG), proposes a pack for each gap, and writes `dumps/refresh_report.txt` + `dumps/proposed.json`. A shop with an incomplete scrape is left untouched.
6. Read the report. Every STALE / AMBIG / FILL / NOFILL line is a human decision: record it in `dumps/overrides.json` (`id|shop|old name` → replacement or `{"drop":true}`; `id|shop|fill` → pack for a gap or drop = not stocked) and re-run step 5 until only CHANGED/RENAMED/OVERRIDE lines remain. `show.py` prints the parsed candidates for one ingredient at one shop. The automatic gap proposals are only a hint — check each one.
7. `python3 apply.py aldi asda sainsburys tesco "new checkedNote"` writes it into the app (keep dates OUT of the note: since v80 the app and app/prices.html work out when each list's prices were read from the packs' `checked` fields) and marks shops with no pack as `unavailable` ("Not stocked"). Bump `APP_VERSION`/`VERSION`, run the tests (`npm run check`), commit on a branch and open a pull request: merging to `main` is the deploy (see the repo `README.md`).

Prices are the standard shelf price everyone pays: no Clubcard or Nectar prices; Aldi's own price cuts and ASDA rollbacks count because nobody needs a card for them.

## Lidl
lidl.co.uk lists only Lidl Plus offers and limited lines; its core range (milk, eggs, chicken, yoghurt…) is not published anywhere online, and trolley.co.uk carries no Lidl prices either. There is no source to price Lidl from.

## Files
`candidates.json` — the 209 ingredients added in v46 with their search terms and nutrition. `merge.py`, `gen.py`, `asda_gen.py` — the v46 one-off tooling (Claude in Chrome + form POST), kept for reference; `refresh.py` supersedes them. `runner.js` — readable copy of the in-page scraper that `gen2.py` inlines.
