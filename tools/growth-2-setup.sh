#!/bin/zsh
# v86 back end, one step: creator codes give 14 free days (supabase/growth-2.sql adds code_kind()). Run once, on either Mac:
#   ./tools/growth-2-setup.sh        (from the root of this repo, thefuelapp/thefuelapp.github.io; any folder works, it finds its own way)
# The SQL goes on your clipboard and Supabase's SQL editor opens: click in, Cmd+A, Cmd+V, Run. The script checks it went in.
set -e
cd "$(dirname "$0")/.."
probe() { curl -s -o /dev/null -w "%{http_code}" -X POST "https://htdmdthyrehhvzflajuk.supabase.co/rest/v1/rpc/code_kind" \
  -H "apikey: sb_publishable_ghYVovG_UYVNy6fxnUFd8w_Au3Tryvm" -H "Content-Type: application/json" -d '{"p_code":"PROBE"}'; }
if [ "$(probe)" = "200" ]; then echo "Already in: code_kind answers. Nothing to do."; exit 0; fi
pbcopy < supabase/growth-2.sql
echo ""
echo "growth-2.sql is on your clipboard. Supabase is opening in your browser."
echo "  Click into the editor, press Cmd+A then Cmd+V, then press Run. It should say: Success. No rows returned."
open "https://supabase.com/dashboard/project/htdmdthyrehhvzflajuk/sql/new"
read "?  Press Enter here once it says Success… "
until [ "$(probe)" = "200" ]; do
  echo "  Not in yet. Look for a red error under the editor. It's back on your clipboard: Cmd+A, Cmd+V, Run."
  pbcopy < supabase/growth-2.sql
  read "?  Press Enter once it says Success… "
done
echo "Done: creator codes now give 14 free days."
