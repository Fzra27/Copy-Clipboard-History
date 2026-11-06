import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_IMAGE, MAX_IMAGE_TOTAL, normalizeEntries, trimEntries, remember, matchesQuery} from '../extension/history.js';
const image = (hash='a'.repeat(64), pinned=false) => ({type:'image',hash,mime:'image/png',size:1024,pinned});
test('old text histories migrate without losing pins or text', () => {
    assert.deepEqual(normalizeEntries([{text:'hello',pinned:true}]),[{type:'text',text:'hello',pinned:true}]);
});
test('mixed histories retain images and reject missing, invalid and unsafe records', () => {
    const valid=image();
    assert.deepEqual(normalizeEntries([valid,image('../escape'),{...valid,size:MAX_IMAGE+1},{...valid,mime:'image/svg+xml'},{type:'text',text:' '}]),[valid]);
    assert.deepEqual(normalizeEntries([valid],()=>false),[]);
});
test('identical image content is deduplicated and pin preserved when copied again', () => {
    const entries=remember([image('a'.repeat(64),true),{type:'text',text:'hi'}],image());
    assert.equal(entries.length,2);assert.equal(entries[0].pinned,true);
});
test('image and text entries cannot collide', () => {
    assert.equal(remember([{type:'text',text:'a'.repeat(64)}],image()).length,2);
});
test('load deduplicates legacy entries and preserves any pin', () => {
    const result=normalizeEntries([{text:'same'}, {text:'same',pinned:true}]);
    assert.equal(result.length,1);assert.equal(result[0].pinned,true);
});
test('eviction enforces image byte budget and retains pins before unpinned items', () => {
    const entries=[image('a'.repeat(64),true),image('b'.repeat(64)),image('c'.repeat(64))];
    const result=trimEntries(entries,200,2048);
    assert.deepEqual(result.map(e=>e.hash[0]),['a','b']);
    assert.equal(entries.length,3);
});
test('pinning cannot exceed hard count and disk byte caps', () => {
    const entries=Array.from({length:20},(_,i)=>({...image(i.toString(16).padStart(64,'0'),true),size:MAX_IMAGE}));
    const result=trimEntries(entries);
    assert.equal(result.length,8);
    assert.equal(result.reduce((n,e)=>n+e.size,0),MAX_IMAGE_TOTAL);
    assert.equal(trimEntries(Array.from({length:201},()=>({type:'text',text:'x',pinned:true}))).length,200);
});
test('text and images remain searchable', () => {
    assert.ok(matchesQuery(image(),'IMAGE'));assert.ok(matchesQuery(image(),'png'));
    assert.ok(matchesQuery({type:'text',text:'Hello World'},'world'));
    assert.ok(!matchesQuery(image(),'unrelated'));
});
