import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import {MAX_IMAGE, IMAGE_MIMES, validHash} from './history.js';

export class ImageStore {
    constructor(directory) {
        this.directory = directory;
    }

    path(hash, thumbnail = false) {
        if (!validHash(hash))
            throw new Error('Invalid image identifier');
        return GLib.build_filenamev([this.directory, hash + (thumbnail ? '.thumb.png' : '.bin')]);
    }

    _ensureDirectory() {
        if (GLib.mkdir_with_parents(this.directory, 0o700) !== 0)
            throw new Error('Could not create image directory');
        const folder = Gio.File.new_for_path(this.directory);
        if (folder.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) !== Gio.FileType.DIRECTORY)
            throw new Error('Image directory must be a directory, not a symbolic link');
        folder.set_attribute_uint32('unix::mode', 0o700, Gio.FileQueryInfoFlags.NONE, null);
    }

    _write(path, bytes) {
        const file = Gio.File.new_for_path(path);
        file.replace_contents(bytes.get_data(), null, false,
            Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    }

    exists(hash) {
        try {
            const file = Gio.File.new_for_path(this.path(hash));
            const info = file.query_info('standard::type,standard::size', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
            return info.get_file_type() === Gio.FileType.REGULAR && info.get_size() > 0 && info.get_size() <= MAX_IMAGE;
        } catch (_) {
            return false;
        }
    }

    save(bytes, mime) {
        if (!bytes || bytes.get_size() < 1 || bytes.get_size() > MAX_IMAGE || !IMAGE_MIMES.includes(mime))
            throw new Error('Image is missing, unsupported, or larger than 8 MiB');
        const loader = GdkPixbuf.PixbufLoader.new_with_mime_type(mime);
        let invalidSize = false;
        loader.connect('size-prepared', (_loader, width, height) => {
            invalidSize = width > 16384 || height > 16384 || width * height > 64000000;
            // Decode a bounded thumbnail rather than a full-resolution preview.
            const scale = Math.min(1, 200 / width, 100 / height);
            loader.set_size(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
        });
        try {
            loader.write(bytes.get_data());
            loader.close();
        } catch (error) {
            try { loader.close(); } catch (_) { /* malformed image */ }
            throw error;
        }
        if (invalidSize)
            throw new Error('Image dimensions exceed the preview limit');
        const pixbuf = loader.get_pixbuf();
        if (!pixbuf)
            throw new Error('Image could not be decoded');
        const stream = Gio.MemoryOutputStream.new_resizable();
        pixbuf.save_to_streamv(stream, 'png', [], [], null);
        stream.close(null);
        const thumbnail = stream.steal_as_bytes();
        const hash = GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, bytes);
        this._ensureDirectory();
        this._write(this.path(hash), bytes);
        this._write(this.path(hash, true), thumbnail);
        return {type: 'image', hash, mime, size: bytes.get_size(), pinned: false};
    }

    read(entry) {
        if (!this.exists(entry.hash))
            throw new Error('Saved image is missing or too large');
        const [ok, data] = Gio.File.new_for_path(this.path(entry.hash)).load_contents(null);
        if (!ok)
            throw new Error('Could not read saved image');
        const bytes = new GLib.Bytes(data);
        if (bytes.get_size() !== entry.size ||
            GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, bytes) !== entry.hash)
            throw new Error('Saved image is damaged');
        return bytes;
    }

    prune(entries) {
        const keep = new Set(entries.filter(e => e.type === 'image').map(e => e.hash));
        const folder = Gio.File.new_for_path(this.directory);
        if (!folder.query_exists(null))
            return;
        const iterator = folder.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        try {
            let info;
            while ((info = iterator.next_file(null))) {
                const name = info.get_name();
                const match = name.match(/^([a-f0-9]{64})\.(?:bin|thumb\.png)$/);
                if (match && !keep.has(match[1]))
                    folder.get_child(name).delete(null);
            }
        } finally {
            iterator.close(null);
        }
    }
}
