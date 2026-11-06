# CopyMind — Ubuntu clipboard history

A local **GNOME Shell extension** for copied **text, URLs and images** on GNOME 46–50 / Wayland.

## Features

- Records new clipboard copies without polling.
- Image previews in a scrollable history menu. Click a preview to copy the **original image bytes** back to the clipboard, then **Ctrl+V** in an application that accepts images.
- PNG, JPEG and GIF images; WebP when the system's GdkPixbuf WebP decoder is installed. Screenshots and browser **Copy image** usually provide PNG.
- Text and images share up to **200 unique entries**, retained across restarts.
- Search text normally; type `image`, `screenshot`, `png`, `jpeg`, etc. to find image entries. This is type search, not OCR or image-content search.
- Pin/unpin, delete an entry, clear unpinned history, pause/resume capture.
- Existing v1 text history is migrated automatically, preserving pins.
- No network calls, telemetry, or cloud storage.

## Install

```bash
git clone https://github.com/Fzra27/Copy-Clipboard-History.git
cd Copy-Clipboard-History
bash install.sh
```

On **Wayland**, log out and log back in after installation. Then:

```bash
gnome-extensions enable copymind@fzra27
```

Click the clipboard icon in the top bar. To check GNOME's version: `gnome-shell --version`.

## Update an existing installation

In your existing `Copy-Clipboard-History` repository folder:

```bash
git pull --ff-only
bash install.sh
```

**Log out and log back in** to reload the JavaScript modules, then run `gnome-extensions enable copymind@fzra27` if needed. Merely toggling the extension does not reliably reload installed JavaScript modules. No history deletion is required.

## How to use image history

1. In a browser use **Copy image**, or copy a screenshot to the clipboard.
2. Open CopyMind from the top bar. The image appears as a preview with its format and size.
3. Copy something else. Later, select the saved image in CopyMind and press **Ctrl+V** in a chat, image editor, or other application that accepts image pastes.
4. Pin important images with ★. Remove an image with × or use **Clear unpinned**.

**Copy image address** copies a URL, so that remains a text entry. Copying a file in the file manager is a file operation and is not captured as an image. Copies made before this update or while recording was paused/disabled cannot be recovered. Animated GIF bytes are retained; the preview shows a still frame. The original encoded file is retained, not a compressed replacement.

## Limits and storage

- Per image: **8 MiB**. Total retained original image bytes: **64 MiB**, plus small PNG thumbnails and JSON metadata. Oversized, unsupported or malformed images are skipped. Image dimensions over 16,384 pixels on either axis or 64 million pixels in total are skipped.
- When the entry or byte cap is reached, the oldest unpinned entries are removed first. Hard caps still apply if all entries are pinned; oldest pins are evicted last.
- Images are identified by SHA-256 of the original bytes; re-copying identical bytes moves the existing entry to the front and preserves its pin. Differently encoded versions of the same picture can be separate entries.
- `~/.local/share/copymind/history.json`: text, pins and image metadata.
- `~/.local/share/copymind/images/`: original image bytes and preview thumbnails. XDG data-directory settings are respected.
- Saved image files are private (0600) and directories are 0700. Deleting/evicting an image entry removes its original and thumbnail after the history is saved successfully. Clearing unpinned entries preserves pinned image files.

## Privacy

Clipboard history can include private text **and screenshots**. Pause when copying sensitive data. Password-manager MIME markers are skipped on a best-effort basis; this cannot guarantee that secrets will never be captured. Files are private to your user, but **not encrypted**. Deletion is not guaranteed forensic erasure.

The GNOME clipboard API delivers complete image content before the extension can enforce its 8 MiB limit. Very large clipboard payloads may briefly consume more memory during transfer. Missing/unsupported decoders and rejected images are reported in the GNOME Shell journal.

## Uninstall

```bash
gnome-extensions disable copymind@fzra27
rm -rf ~/.local/share/gnome-shell/extensions/copymind@fzra27
```

Uninstalling leaves history in `~/.local/share/copymind/`. To remove saved history, delete that application-specific directory (including `images/`) yourself. Back up anything you want to keep first.

## Development and validation

No npm or Python packages are needed to run the extension. The installer copies **all five runtime files** from `extension/`. `history.js` contains shared history rules; `imageStore.js` handles private binary storage and previews.

```bash
npm test
# Ubuntu system packages for the standalone image storage test:
# sudo apt install gjs gir1.2-gdkpixbuf-2.0
gjs -m tests/image-store.gjs.js
```

15 JavaScript checks cover history migration, mixed entries, duplicates, pin preservation, storage limits, search, text compatibility, binary restoration, privacy-marker skipping and stale/paused/disabled clipboard callbacks. The real GJS/GdkPixbuf image-store test runs in an Ubuntu 24.04 container and verifies PNG decoding, thumbnail bounds, byte-identical restoration, private permissions, malformed images, path validation and deletion cleanup.

GNOME 46's upstream St clipboard and scroll APIs were checked. These tests **do not replace a live GNOME Shell/Wayland integration test**; actual screenshot capture, top-bar previews and pasting into external applications must also be checked in your desktop session.
