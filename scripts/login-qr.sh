#!/usr/bin/env bash
# Cetak QR login sekali-jalan untuk Pochi Gateway.
#
# Token disisipkan sebagai hash URL (`/#token=...`), jadi tidak pernah ikut
# terkirim ke server maupun tercatat di access log. Setelah halaman dibuka,
# hash diganti ke rute normal dan token disimpan di sessionStorage perangkat.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKEN_FILE="$REPO_ROOT/data/admin_token"
BASE="${1:-}"

command -v qrencode >/dev/null || { echo "qrencode belum ada: sudo pacman -S qrencode" >&2; exit 1; }
[[ -r "$TOKEN_FILE" ]] || { echo "token tidak terbaca: $TOKEN_FILE" >&2; exit 1; }

TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
[[ -n "$TOKEN" ]] || { echo "token kosong" >&2; exit 1; }

if [[ -z "$BASE" ]]; then
  HOST="$(tailscale status --json 2>/dev/null \
    | python3 -c 'import json,sys;print((json.load(sys.stdin).get("Self",{}).get("DNSName") or "").rstrip("."))' 2>/dev/null || true)"
  [[ -n "$HOST" ]] || { echo "hostname tailnet tidak terbaca; sebutkan base URL: $0 https://host.tailnet.ts.net" >&2; exit 1; }
  BASE="https://$HOST"
fi
BASE="${BASE%/}"

echo "Buka URL ini di perangkat yang sudah login Tailscale:"
echo
echo "  $BASE/#token=<token>"
echo
qrencode -t ansiutf8 -m 2 "$BASE/#token=$TOKEN"
echo
echo "QR ini berisi admin token. Jangan difoto sembarangan, jangan dibagikan."
echo "Cabut kapan saja: systemctl --user restart pochi-gateway setelah token diganti."
