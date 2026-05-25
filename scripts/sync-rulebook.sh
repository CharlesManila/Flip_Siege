#!/usr/bin/env sh
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/rules/rulebook.html"
DST="$(cd "$(dirname "$0")/.." && pwd)/rules/rulebook.html"
test -f "$SRC" || { echo "Missing $SRC"; exit 1; }
cp -f "$SRC" "$DST"
echo "Synced rulebook -> play/rules/rulebook.html"
