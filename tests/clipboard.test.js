import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as rules from '../extension/history.js';
// Exercise the real controller against clipboard doubles. No GNOME globals are
// available in Node; the real image store has its own GJS integration test.
let source=fs.readFileSync(new URL('../extension/extension.js',import.meta.url),'utf8');
source=source.replace(/^import .*;\n/gm,'').replace('export default class','class');
const Indicator=new Function('Gio','GLib','GObject','Meta','St','Extension','Main','PanelMenu','PopupMenu','ImageStore',...['MAX_TEXT','IMAGE_MIMES','normalizeEntries','remember','matchesQuery'],source+'\nreturn CopyMindIndicator;')(
 {},{build_filenamev:p=>p.join('/'),get_user_data_dir:()=>'/tmp'}, {registerClass:c=>c},{}, {ClipboardType:{CLIPBOARD:1}},class {},{notify(){}},{Button:class {}},{},class {},rules.MAX_TEXT,rules.IMAGE_MIMES,rules.normalizeEntries,rules.remember,rules.matchesQuery);
function controller(mimes=['image/png']) {
 const item=Object.create(Indicator.prototype);
 Object.assign(item,{_alive:true,_paused:false,_captureSerial:1,_entries:[],_saveHistory(){},_refresh(){},menu:{close(){}}});
 const pending=[];
 item._clipboard={get_mimetypes:()=>mimes,get_content:(type,mime,cb)=>pending.push(cb),get_text:(type,cb)=>pending.push(cb),set_content:(...args)=>{item.restored=args;},set_text:(...args)=>{item.restored=args;}};
 item._images={save:bytes=>({type:'image',hash:'a'.repeat(64),mime:'image/png',size:bytes.size}),read:()=>({original:true})};
 return {item,pending};
}
test('image MIME takes priority over an accompanying URL',()=>{
 const {item,pending}=controller(['text/plain','image/png']);item._capture();pending[0](null,{size:12});
 assert.equal(item._entries[0].type,'image');assert.equal(item._entries[0].size,12);
});
test('older asynchronous image copy cannot replace newer clipboard content',()=>{
 const {item,pending}=controller();item._capture();item._captureSerial++;pending[0](null,{size:12});assert.equal(item._entries.length,0);
});
test('pause invalidates already pending image and text reads',()=>{
 for(const mimes of [['image/png'],['text/plain']]) {
  const {item,pending}=controller(mimes);item._capture();item._paused=true;pending[0](null,mimes[0]==='text/plain'?'private':{size:12});assert.equal(item._entries.length,0);
 }
});
test('password manager markers prevent both image and text capture',()=>{
 const {item,pending}=controller(['image/png','application/x-keepassxc-secret']);item._capture();assert.equal(pending.length,0);
});
test('disabling extension prevents late image reads from writing history',()=>{
 const {item,pending}=controller();item._capture();item._alive=false;pending[0](null,{size:12});assert.equal(item._entries.length,0);
});
test('restoring an image publishes original binary bytes, not its filename or URL',()=>{
 const {item}=controller();item._restore({type:'image',mime:'image/png'});assert.deepEqual(item.restored,[1,'image/png',{original:true}]);
});
test('text capture and restore remain compatible',()=>{
 const {item,pending}=controller(['text/plain']);item._capture();pending[0](null,'hello');assert.equal(item._entries[0].text,'hello');item._restore(item._entries[0]);assert.deepEqual(item.restored,[1,'hello']);
});
