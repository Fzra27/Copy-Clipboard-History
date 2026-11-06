import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import ByteArray from 'resource:///org/gnome/gjs/modules/byteArray.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const LIMIT = 200;
const MAX_TEXT = 20000;
const DIR = GLib.build_filenamev([GLib.get_user_data_dir(), 'copymind']);
const HISTORY_PATH = GLib.build_filenamev([DIR, 'history.json']);
const CLIP = St.ClipboardType.CLIPBOARD;
const SENSITIVE_MIME = ['x-kde-passwordmanagerhint', 'application/x-keepassxc-secret', 'application/x-bitwarden-secret'];

function preview(text, max = 78) {
    const s = text.replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

class CopyMindIndicator extends PanelMenu.Button {
    constructor() {
        super(0.0, 'CopyMind Clipboard History');
        this._alive = true;
        this._paused = false;
        this._entries = [];
        this._rows = [];
        this._loadHistory();

        this.add_child(new St.Icon({
            icon_name: 'edit-paste-symbolic',
            style_class: 'system-status-icon',
        }));
        this.menu.box.add_style_class_name('copymind-menu');

        const title = new PopupMenu.PopupMenuItem('CopyMind · Clipboard History', {reactive: false});
        this.menu.addMenuItem(title);

        const searchItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this._search = new St.Entry({
            hint_text: 'Search copied text…',
            can_focus: true,
            x_expand: true,
        });
        searchItem.add_child(this._search);
        this.menu.addMenuItem(searchItem);
        this._search.clutter_text.connect('text-changed', () => this._refresh());

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._buildFooter();
        this._refresh();

        this._clipboard = St.Clipboard.get_default();
        this._selection = global.display.get_selection();
        this._selectionId = this._selection.connect('owner-changed', (_sel, type, source) => {
            if (!this._alive || this._paused || !source ||
                type !== Meta.SelectionType.SELECTION_CLIPBOARD)
                return;
            this._capture();
        });
    }

    _loadHistory() {
        try {
            const [ok, data] = GLib.file_get_contents(HISTORY_PATH);
            if (!ok)
                return;
            const json = JSON.parse(ByteArray.toString(data));
            if (Array.isArray(json)) {
                this._entries = json.filter(item => item &&
                    typeof item.text === 'string' && item.text.length > 0 &&
                    item.text.length <= MAX_TEXT).slice(0, LIMIT)
                    .map(item => ({text: item.text, pinned: item.pinned === true}));
            }
        } catch (e) {
            // Missing file or invalid JSON: start with an empty history.
            log('CopyMind: could not load clipboard history: ' + e.message);
        }
    }

    _saveHistory() {
        try {
            GLib.mkdir_with_parents(DIR, 0o700);
            const contents = JSON.stringify(this._entries);
            GLib.file_set_contents(HISTORY_PATH, contents);
            GLib.chmod(DIR, 0o700);
            GLib.chmod(HISTORY_PATH, 0o600);
        } catch (e) {
            logError(e, 'CopyMind: could not save clipboard history');
        }
    }

    _isSensitive() {
        try {
            const mimes = this._clipboard.get_mimetypes(CLIP) ?? [];
            return mimes.some(mime => SENSITIVE_MIME.some(secret =>
                mime.toLowerCase().includes(secret)));
        } catch (e) {
            // API absence should not break normal clipboard functionality.
            return false;
        }
    }

    _capture() {
        if (this._isSensitive())
            return;
        this._clipboard.get_text(CLIP, (_clipboard, text) => {
            if (!this._alive || this._paused ||
                typeof text !== 'string' || !text.trim() ||
                text.length > MAX_TEXT)
                return;
            const previous = this._entries.find(item => item.text === text);
            const pinned = previous?.pinned ?? false;
            this._entries = this._entries.filter(item => item.text !== text);
            this._entries.unshift({text, pinned});
            this._trim();
            this._saveHistory();
            this._refresh();
        });
    }

    _trim() {
        if (this._entries.length <= LIMIT)
            return;
        // Keep pinned entries whenever possible; evict oldest unpinned entries.
        for (let i = this._entries.length - 1; i >= 0 && this._entries.length > LIMIT; i--) {
            if (!this._entries[i].pinned)
                this._entries.splice(i, 1);
        }
        this._entries = this._entries.slice(0, LIMIT);
    }

    _makeButton(label, click, tooltip = '') {
        const button = new St.Button({
            label,
            style_class: 'copymind-mini-button',
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        if (tooltip)
            button.set_tooltip_text(tooltip);
        button.connect('clicked', click);
        return button;
    }

    _buildFooter() {
        this._footer = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        const box = new St.BoxLayout({style_class: 'copymind-footer', x_expand: true});
        this._pauseButton = this._makeButton('Pause', () => {
            this._paused = !this._paused;
            this._pauseButton.set_label(this._paused ? 'Resume' : 'Pause');
        }, 'Stop or resume capturing new copies');
        box.add_child(this._pauseButton);
        box.add_child(this._makeButton('Clear unpinned', () => {
            this._entries = this._entries.filter(e => e.pinned);
            this._saveHistory();
            this._refresh();
        }));
        this._footer.add_child(box);
        this.menu.addMenuItem(this._footer);
    }

    _refresh() {
        if (!this._search)
            return;
        for (const row of this._rows)
            row.destroy();
        this._rows = [];

        const query = this._search.get_text().toLocaleLowerCase();
        const matches = this._entries
            .filter(e => e.text.toLocaleLowerCase().includes(query))
            .sort((a, b) => Number(b.pinned) - Number(a.pinned))
            .slice(0, 40);

        if (matches.length === 0) {
            const empty = new PopupMenu.PopupMenuItem(
                query ? 'No matching entries' : 'Copy text to begin collecting history',
                {reactive: false});
            this.menu.addMenuItem(empty, 3);
            this._rows.push(empty);
            return;
        }

        for (const entry of matches) {
            const row = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
            const content = new St.BoxLayout({
                style_class: 'copymind-row',
                x_expand: true,
            });
            const pick = this._makeButton(preview(entry.text), () => {
                this._clipboard.set_text(CLIP, entry.text);
                this.menu.close();
            }, 'Copy this entry to clipboard');
            pick.x_expand = true;
            content.add_child(pick);
            content.add_child(this._makeButton(entry.pinned ? '★' : '☆', () => {
                entry.pinned = !entry.pinned;
                this._saveHistory();
                this._refresh();
            }, 'Pin or unpin'));
            content.add_child(this._makeButton('×', () => {
                this._entries = this._entries.filter(e => e !== entry);
                this._saveHistory();
                this._refresh();
            }, 'Delete entry'));
            row.add_child(content);
            this.menu.addMenuItem(row, 3 + this._rows.length);
            this._rows.push(row);
        }
    }

    destroy() {
        this._alive = false;
        if (this._selection && this._selectionId)
            this._selection.disconnect(this._selectionId);
        this._rows = [];
        super.destroy();
    }
}

export default class CopyMindExtension extends Extension {
    enable() {
        this._indicator = new CopyMindIndicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
