import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {MAX_TEXT, IMAGE_MIMES, normalizeEntries, remember, matchesQuery} from './history.js';
import {ImageStore} from './imageStore.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const DIR = GLib.build_filenamev([GLib.get_user_data_dir(), 'copymind']);
const HISTORY_PATH = GLib.build_filenamev([DIR, 'history.json']);
const CLIP = St.ClipboardType.CLIPBOARD;
const SENSITIVE_MIME = ['x-kde-passwordmanagerhint', 'application/x-keepassxc-secret', 'application/x-bitwarden-secret'];

function preview(text, max = 78) {
    const s = text.replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

const CopyMindIndicator = GObject.registerClass(
class CopyMindIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'CopyMind Clipboard History');
        this._alive = true;
        this._paused = false;
        this._entries = [];
        this._captureSerial = 0;
        this._images = new ImageStore(GLib.build_filenamev([DIR, 'images']));
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
            hint_text: 'Search text or type image…',
            can_focus: true,
            x_expand: true,
        });
        searchItem.add_child(this._search);
        this.menu.addMenuItem(searchItem);
        this._search.clutter_text.connect('text-changed', () => this._refresh());

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const listItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        const scroll = new St.ScrollView({style_class: 'copymind-scroll', x_expand: true});
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this._list = new St.BoxLayout({vertical: true, x_expand: true});
        scroll.set_child(this._list);
        listItem.add_child(scroll);
        this.menu.addMenuItem(listItem);
        this._buildFooter();
        this._refresh();

        this._clipboard = St.Clipboard.get_default();
        this._selection = global.display.get_selection();
        this._selectionId = this._selection.connect('owner-changed', (_sel, type, source) => {
            if (type !== Meta.SelectionType.SELECTION_CLIPBOARD)
                return;
            this._captureSerial++;
            if (!this._alive || this._paused || !source)
                return;
            this._capture();
        });
    }

    _loadHistory() {
        try {
            const [ok, data] = GLib.file_get_contents(HISTORY_PATH);
            if (!ok)
                return;
            const json = JSON.parse(new TextDecoder().decode(data));
            this._entries = normalizeEntries(json, hash => this._images.exists(hash));
        } catch (e) {
            // Missing file or invalid JSON: start with an empty history.
            log('CopyMind: could not load clipboard history: ' + e.message);
        }
    }

    _saveHistory() {
        try {
            GLib.mkdir_with_parents(DIR, 0o700);
            const contents = JSON.stringify(this._entries);
            Gio.File.new_for_path(HISTORY_PATH).replace_contents(
                new TextEncoder().encode(contents), null, false,
                Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            Gio.File.new_for_path(DIR).set_attribute_uint32(
                'unix::mode', 0o700, Gio.FileQueryInfoFlags.NONE, null);
            Gio.File.new_for_path(HISTORY_PATH).set_attribute_uint32(
                'unix::mode', 0o600, Gio.FileQueryInfoFlags.NONE, null);
            this._images.prune(this._entries);
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
        const serial = this._captureSerial;
        const current = () => this._alive && !this._paused && serial === this._captureSerial;
        const mimes = this._clipboard.get_mimetypes(CLIP) ?? [];
        const mime = IMAGE_MIMES.find(type => mimes.includes(type));
        if (mime) {
            this._clipboard.get_content(CLIP, mime, (_clipboard, bytes) => {
                if (!current() || !bytes)
                    return;
                try {
                    const entry = this._images.save(bytes, mime);
                    this._entries = remember(this._entries, entry);
                    this._saveHistory();
                    this._refresh();
                } catch (error) {
                    log('CopyMind: image skipped: ' + error.message);
                }
            });
            return;
        }
        this._clipboard.get_text(CLIP, (_clipboard, text) => {
            if (!current() || typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT)
                return;
            this._entries = remember(this._entries, {type: 'text', text});
            this._saveHistory();
            this._refresh();
        });
    }

    _restore(entry) {
        try {
            if (entry.type === 'image')
                this._clipboard.set_content(CLIP, entry.mime, this._images.read(entry));
            else
                this._clipboard.set_text(CLIP, entry.text);
            this.menu.close();
        } catch (error) {
            Main.notify('CopyMind', 'Saved image could not be copied. It may have been removed.');
            logError(error, 'CopyMind: could not restore entry');
        }
    }

    _makeButton(label, click, tooltip = '') {
        const button = new St.Button({
            label,
            style_class: 'copymind-mini-button',
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        // St.Button is not a GTK widget; unsupported tooltip methods are avoided.
        button.connect('clicked', click);
        return button;
    }

    _buildFooter() {
        this._footer = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        const box = new St.BoxLayout({style_class: 'copymind-footer', x_expand: true});
        this._pauseButton = this._makeButton('Pause', () => {
            this._paused = !this._paused;
            this._captureSerial++;
            this._pauseButton.set_label(this._paused ? 'Resume' : 'Pause');
        }, 'Stop or resume capturing new copies');
        box.add_child(this._pauseButton);
        box.add_child(this._makeButton('Clear unpinned', () => {
            this._captureSerial++;
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
            .filter(e => matchesQuery(e, query))
            .sort((a, b) => Number(b.pinned) - Number(a.pinned));

        if (matches.length === 0) {
            const empty = new PopupMenu.PopupMenuItem(
                query ? 'No matching entries' : 'Copy text or an image to begin collecting history',
                {reactive: false});
            this._list.add_child(empty);
            this._rows.push(empty);
            return;
        }

        for (const entry of matches) {
            const row = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
            const content = new St.BoxLayout({
                style_class: 'copymind-row',
                x_expand: true,
            });
            const pick = this._makeButton('', () => this._restore(entry));
            if (entry.type === 'image') {
                const box = new St.BoxLayout({vertical: true, style_class: 'copymind-image-box'});
                const thumbnail = new St.Icon({
                    gicon: new Gio.FileIcon({file: Gio.File.new_for_path(this._images.path(entry.hash, true))}),
                    icon_size: 100,
                    style_class: 'copymind-image-preview',
                    fallback_icon_name: 'image-x-generic-symbolic',
                });
                box.add_child(thumbnail);
                box.add_child(new St.Label({text: `Image · ${entry.mime.split('/')[1].toUpperCase()} · ${Math.ceil(entry.size / 1024)} KiB`}));
                pick.set_child(box);
                pick.accessible_name = 'Copy saved image to clipboard';
            } else {
                pick.set_label(preview(entry.text));
            }
            pick.x_expand = true;
            content.add_child(pick);
            content.add_child(this._makeButton(entry.pinned ? '★' : '☆', () => {
                entry.pinned = !entry.pinned;
                this._saveHistory();
                this._refresh();
            }, 'Pin or unpin'));
            content.add_child(this._makeButton('×', () => {
                this._captureSerial++;
                this._entries = this._entries.filter(e => e !== entry);
                this._saveHistory();
                this._refresh();
            }, 'Delete entry'));
            row.add_child(content);
            this._list.add_child(row);
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
});

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
