#!/usr/bin/env sh
# Used by GitHub Actions: inject Supabase URL + anon key at deploy (anon from repo secret).
set -e
URL="${SUPABASE_URL:-https://wfjmrtogzfpkinivjipr.supabase.co}"
KEY="${SUPABASE_ANON_KEY:-}"

cat > js/playLogConfig.js <<EOF
/**
 * Online play logging — finished games only.
 * Deploy workflow may overwrite this file from GitHub Secrets.
 */
export const PLAY_LOG = {
  enabled: true,
  supabaseUrl: "${URL}",
  supabaseAnonKey: "${KEY}",
  table: "finished_games",
  webhookUrl: "",
  logLocalhost: false,
};
EOF

echo "Wrote js/playLogConfig.js (anon key length: ${#KEY})"
