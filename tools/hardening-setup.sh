#!/bin/zsh
# v102 back end, two steps. Run once, on either Mac:
#   ./tools/hardening-setup.sh        (from the root of this repo, thefuelapp/thefuelapp.github.io; any folder works, it finds its own way)
# 1) supabase/hardening.sql goes on your clipboard and Supabase's SQL editor opens: click in, Cmd+A, Cmd+V, Run. The script checks it went in.
# 2) The payment function is sent up again (a full refund now takes the access back).
set -e
cd "$(dirname "$0")/.."
probe() { curl -s -o /dev/null -w "%{http_code}" -X POST "https://htdmdthyrehhvzflajuk.supabase.co/rest/v1/rpc/fuel_hardening" \
  -H "apikey: sb_publishable_ghYVovG_UYVNy6fxnUFd8w_Au3Tryvm" -H "Content-Type: application/json" -d '{}'; }
if [ "$(probe)" = "200" ]; then echo "Step 1 already done: the database changes are in."; else
  pbcopy < supabase/hardening.sql
  echo ""
  echo "Step 1 of 2. hardening.sql is on your clipboard. Supabase is opening in your browser."
  echo "  Click into the editor, press Cmd+A then Cmd+V, then press Run. It should say: Success. No rows returned."
  open "https://supabase.com/dashboard/project/htdmdthyrehhvzflajuk/sql/new"
  read "?  Press Enter here once it says Success… "
  until [ "$(probe)" = "200" ]; do
    echo "  Not in yet. Look for a red error under the editor. It's back on your clipboard: Cmd+A, Cmd+V, Run."
    pbcopy < supabase/hardening.sql
    read "?  Press Enter once it says Success… "
  done
  echo "Step 1 done."
fi
echo ""
echo "Step 2 of 2. Sending the payment function up…"
npx --yes supabase functions deploy payment-webhook --no-verify-jwt --project-ref htdmdthyrehhvzflajuk
echo ""
echo "All done ($(date '+%d %b %H:%M')). Delete my account now shows in Settings, and a full refund removes access."
