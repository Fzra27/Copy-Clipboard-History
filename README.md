# CopyMind — Ubuntu clipboard history

A lightweight, local-first **GNOME Shell extension** that remembers copied **text and URLs** on Ubuntu 24.04 (GNOME 46, Wayland).

## Features

- Automatically records copied text without clipboard polling.
- Stores up to 200 recent unique entries across restarts.
- Live search, pin/unpin, delete individual entries, or clear unpinned entries.
- Click an entry to put it back on your clipboard; then use **Ctrl+V**.
- Pause and resume clipboard recording from the top-bar menu.
- Skips MIME types marked as password-manager secrets (best effort).
- Data stays on your computer. No network calls, telemetry, or cloud.

## Install (Ubuntu 24.04)

```bash
git clone https://github.com/Fzra27/Copy-Clipboard-History.git
cd Copy-Clipboard-History
bash install.sh
```

**Important:** On a GNOME Wayland session, log out and log back in once after installation. Then run:

```bash
gnome-extensions enable copymind@fzra27
```

Look for the **clipboard icon** in the top bar. Click it to browse or search your history.

To check your GNOME version: `gnome-shell --version`.

## Uninstall

```bash
gnome-extensions disable copymind@fzra27
rm -rf ~/.local/share/gnome-shell/extensions/copymind@fzra27
```

Your history remains until you delete `~/.local/share/copymind/history.json`.

## Privacy and limitations

This software deliberately handles **text and URLs only**, not images or files. Clipboard history can include private data. **Pause** when copying sensitive text and **Clear** history when needed. Sensitive MIME filtering is best-effort and cannot guarantee passwords will never be captured; never treat clipboard history as a secret vault. Local JSON is private to your user account (directory 0700, file 0600), but not encrypted. Deleting this file does not guarantee forensic erasure.

The extension cannot recover text copied *before* it was installed or while it was disabled. Choosing an entry **copies it**, it does not automatically type into other applications.

## Development

Files in `extension/` use modern GNOME Shell ESM imports (GNOME 46+). No Python packages or polling daemon required. GNOME Shell integration should be tested on a live Ubuntu session; static inspection does not substitute for runtime testing.
