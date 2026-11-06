#!/usr/bin/env bash
set -euo pipefail
UUID="copymind@fzra27"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/extension"
DST="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
mkdir -p "${DST}"
cp "${SRC}/metadata.json" "${SRC}/extension.js" "${SRC}/history.js" "${SRC}/imageStore.js" "${SRC}/stylesheet.css" "${DST}/"
echo "CopyMind installed to ${DST}"
echo "On Wayland: log out and log back in, then run:"
echo "gnome-extensions enable ${UUID}"
