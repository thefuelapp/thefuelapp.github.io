#!/bin/zsh
# Stores the Stripe webhook signing secret in Supabase, reading it from the clipboard so it is never typed or pasted anywhere.
# 1) Stripe → Workbench → Webhooks → fuel-supabase-unlock → Signing secret → Reveal → copy.   2) Run this script.
set -e
V="$(pbpaste | tr -d '[:space:]')"
case "$V" in
  whsec_*) ;;
  sk_*|rk_*|pk_*) echo "That's a Stripe API key, not the webhook signing secret. Nothing was changed. Copy the value under 'Signing secret' on the webhook page (it starts whsec_) and run this again."; exit 1 ;;
  *) echo "The clipboard doesn't hold a signing secret (it should start with whsec_). Nothing was changed."; exit 1 ;;
esac
[ ${#V} -gt 20 ] || { echo "That looks too short to be the secret. Nothing was changed."; exit 1; }
npx --yes supabase secrets set "STRIPE_WEBHOOK_SECRET=$V" --project-ref htdmdthyrehhvzflajuk
echo "Done: STRIPE_WEBHOOK_SECRET stored ($(date '+%d %b %H:%M'))."
