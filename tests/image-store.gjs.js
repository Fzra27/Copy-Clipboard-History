import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import {ImageStore} from '../extension/imageStore.js';
function assert(value, message) {if (!value) throw new Error(message);}
const directory=GLib.dir_make_tmp('copymind-image-test-XXXXXX');
const store=new ImageStore(directory);
const pixbuf=GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB,true,8,640,480);
pixbuf.fill(0x35896eff);
const stream=Gio.MemoryOutputStream.new_resizable();
pixbuf.save_to_streamv(stream,'png',[],[],null);stream.close(null);
const bytes=stream.steal_as_bytes();
const entry=store.save(bytes,'image/png');
assert(entry.size===bytes.get_size(),'wrong original size');
assert(store.exists(entry.hash),'missing original');
assert(store.read(entry).equal(bytes),'restored image differs from original');
const thumbnail=GdkPixbuf.Pixbuf.new_from_file(store.path(entry.hash,true));
assert(thumbnail.width<=200 && thumbnail.height<=100,'thumbnail is unbounded');
for (const path of [directory,store.path(entry.hash),store.path(entry.hash,true)]) {
 const mode=Gio.File.new_for_path(path).query_info('unix::mode',Gio.FileQueryInfoFlags.NONE,null).get_attribute_uint32('unix::mode') & 0o777;
 assert(mode===(path===directory?0o700:0o600),'image permissions are not private');
}
let rejected=false;
try {store.save(new GLib.Bytes(new Uint8Array([1,2,3])),'image/png');} catch (_) {rejected=true;}
assert(rejected,'malformed image accepted');
rejected=false;
try {store.save(bytes,'image/svg+xml');} catch (_) {rejected=true;}
assert(rejected,'unsupported image accepted');
rejected=false;
try {store.path('../outside');} catch (_) {rejected=true;}
assert(rejected,'unsafe image path accepted');
store.prune([entry]);assert(store.exists(entry.hash),'retained image deleted');
store.prune([]);assert(!store.exists(entry.hash),'deleted image bytes not removed');
assert(!Gio.File.new_for_path(store.path(entry.hash,true)).query_exists(null),'thumbnail was not removed');
Gio.File.new_for_path(directory).delete(null);
print('PASS real GJS image store: PNG decode, thumbnail, byte-identical restore, private permissions, malformed data, path validation, cleanup');
