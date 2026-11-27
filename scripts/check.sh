#!/bin/sh
# Pre-merge safety check. Run it before opening or merging a pull request into main:  npm run check
# It is the safety net from the retired deploy.sh (added 20 Sep 2026 after a stray apostrophe shipped a blank app), with the
# deploying taken out. It never commits, pushes or touches git: merging to main on GitHub is the only deploy.
#   1. every app script must parse as a module (`node --check file.js` alone does NOT catch this: it must be checked as .mjs)
#   2. the files the live site cannot do without must exist and not be empty
#   3. the logic tests must pass
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/app"
CHK="$(mktemp -d)"
for f in "$SRC"/*.js; do
  n="$(basename "$f" .js)"
  cp "$f" "$CHK/$n.mjs"
  node --check "$CHK/$n.mjs" || { echo "CHECK FAILED: $n.js has a syntax error"; rm -rf "$CHK"; exit 1; }
done
rm -rf "$CHK"
for f in index.html sw.js .nojekyll site/index.html app/index.html app/app.js app/planner.js app/cloud.js app/growth.js app/autoplan.js app/insights.js app/config.js app/sw.js app/styles.css app/manifest.json app/data/recipes.json app/data/ingredients.json; do
  [ -e "$ROOT/$f" ] || { echo "CHECK FAILED: $f is missing"; exit 1; }
  case "$f" in .nojekyll) ;; *) [ -s "$ROOT/$f" ] || { echo "CHECK FAILED: $f is empty"; exit 1; } ;; esac
done
(cd "$SRC" && node --test tests/*.mjs >/dev/null 2>&1) || { echo "CHECK FAILED: the logic tests fail (run: cd app && node --test tests/*.mjs)"; exit 1; }
echo "check passed: scripts parse, site files present, tests pass"
