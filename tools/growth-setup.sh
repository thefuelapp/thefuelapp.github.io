#!/bin/zsh
# Switches on the back end of v81 (free week counting, bring 3 mates, creator codes and commissions). Run once, on either Mac:
#   ./tools/growth-setup.sh        (from the root of this repo, thefuelapp/thefuelapp.github.io; any folder works, it finds its own way)
# Step 1 puts supabase/growth.sql on your clipboard and opens Supabase's SQL editor: paste, Run.
# Step 2 deploys the updated Stripe webhook (it records each sale for the creator whose code the buyer came with).
set -e
cd "$(dirname "$0")/.."
pbcopy < supabase/growth.sql
echo ""
echo "STEP 1 of 2: the database"
echo "  growth.sql is now on your clipboard. Supabase is opening in your browser."
echo "  Click into the editor, press Cmd+A then Cmd+V, then press Run."
echo "  It should say: Success. No rows returned."
open "https://supabase.com/dashboard/project/htdmdthyrehhvzflajuk/sql/new"
read "?  Press Enter here once it says Success… "
# Check it really went in: once it has, a made-up code gets {"ok":false} back instead of a 404.
probe() { curl -s -o /dev/null -w "%{http_code}" -X POST "https://htdmdthyrehhvzflajuk.supabase.co/rest/v1/rpc/mate_status" \
  -H "apikey: sb_publishable_ghYVovG_UYVNy6fxnUFd8w_Au3Tryvm" -H "Content-Type: application/json" -d '{"p_code":"PROBE","p_secret":"x"}'; }
until [ "$(probe)" = "200" ]; do
  echo "  Not in yet: Supabase doesn't have the new functions. Look for a red error under the editor."
  echo "  It's back on your clipboard. Click into the editor, Cmd+A, Cmd+V, Run."
  pbcopy < supabase/growth.sql
  read "?  Press Enter once it says Success… "
done
echo "  Database: done ✓"
echo ""
echo "STEP 2 of 2: the payment webhook"
echo "  If your Mac asks to use the 'Supabase CLI' keychain item, click Always Allow."
npx -y supabase@latest functions deploy payment-webhook --no-verify-jwt --project-ref htdmdthyrehhvzflajuk
echo ""
echo "All done. Tell Claude 'backend done' and it will check it from its side."
