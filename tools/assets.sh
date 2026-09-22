#!/usr/bin/env bash
#
# Regenerates every icon and the social card in public/.
#
# The icons all come from public/favicon.svg, the one place the mark is drawn:
# this only re-dresses it (drop the rounded corners for the platforms that mask
# the icon themselves, pull the glyph into the maskable safe zone) and rasterizes.
# The card comes from tools/og.html, rendered by a headless browser so it is set
# in the same system font the game uses.
#
# Needs: rsvg-convert (brew install librsvg), python3, Google Chrome.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
public="$root/public"
source_svg="$public/favicon.svg"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

chrome=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
for tool in rsvg-convert python3; do
  command -v "$tool" >/dev/null || { echo "missing $tool" >&2; exit 1; }
done
[ -x "$chrome" ] || { echo "missing Chrome at $chrome (set CHROME=...)" >&2; exit 1; }

# The two rewrites below are string edits on the mark; fail loudly if it moved.
grep -q 'rx="7"' "$source_svg" || { echo "favicon.svg: no rounded backdrop to drop" >&2; exit 1; }
grep -q '<g fill="#b388eb">' "$source_svg" || { echo "favicon.svg: no glyph group to scale" >&2; exit 1; }

# iOS and Android mask the icon into their own shape, so those get a square
# backdrop; Android also crops to a circle, which the 0.86 scale keeps clear of.
sed 's| rx="7"||' "$source_svg" >"$work/square.svg"
sed -e 's| rx="7"||' \
  -e 's|<g fill="#b388eb">|<g fill="#b388eb" transform="translate(16 16) scale(0.86) translate(-16 -16)">|' \
  "$source_svg" >"$work/maskable.svg"

rsvg-convert -w 180 -h 180 "$work/square.svg" -o "$public/apple-touch-icon.png"
rsvg-convert -w 512 -h 512 "$work/maskable.svg" -o "$public/icon-maskable-512.png"
rsvg-convert -w 192 -h 192 "$source_svg" -o "$public/icon-192.png"
rsvg-convert -w 512 -h 512 "$source_svg" -o "$public/icon-512.png"
for size in 16 32 48; do
  rsvg-convert -w "$size" -h "$size" "$source_svg" -o "$work/ico-$size.png"
done

# favicon.ico: a directory over the three PNGs above, which every browser that
# still asks for an .ico can read.
python3 - "$work" "$public/favicon.ico" <<'PY'
import pathlib, struct, sys

work, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
images = [(size, (work / f"ico-{size}.png").read_bytes()) for size in (16, 32, 48)]
entries, blobs = b"", b""
offset = 6 + 16 * len(images)
for size, data in images:
    entries += struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(data), offset)
    blobs += data
    offset += len(data)
out.write_bytes(struct.pack("<HHH", 0, 1, len(images)) + entries + blobs)
PY

"$chrome" --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=3000 \
  --screenshot="$public/og.png" "file://$root/tools/og.html" >/dev/null 2>&1

echo "public/: $(cd "$public" && echo *.png *.ico)"
