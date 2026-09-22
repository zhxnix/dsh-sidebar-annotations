import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {installPicker, readElementSource} from '../lib/picker.js';

// A stale browser selection must not replace the element clicked by the user.
const listeners = new Map();
const noop = () => {};
const nodes = [];
function fakeNode() {
  const handlers = new Map();
  return {
    nodeType:1,
    style:{},
    parentNode:null,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); },
    getAttribute(name) { return this.attributes[name] || null; },
    attributes:{},
    contains:()=>false,
    addEventListener(name, fn) { handlers.set(name, fn); },
    removeEventListener(name) { handlers.delete(name); },
    handlers
  };
}
const root = {
  appendChild(node) { node.parentNode = this; nodes.push(node); },
  removeChild(node) { const index = nodes.indexOf(node); if (index >= 0) nodes.splice(index, 1); node.parentNode = null; }
};
globalThis.document = {
  title:'Preview', createElement:()=>fakeNode(),
  documentElement:root,
  addEventListener:(name,fn)=>listeners.set(name,fn), removeEventListener:noop
};
globalThis.window = {
  location:{href:'http://localhost/preview'},
  addEventListener:(name,fn)=>listeners.set('window:'+name,fn), removeEventListener:noop,
  getSelection:()=>{throw new Error('Element picker must not read global selection');}
};
const owner = {getAttribute:name => ({'data-dsh-source-file':'/project/miniprogram/pages/home/home.wxml','data-dsh-source-line':'48'})[name]};
const target = {
  nodeType:1, localName:'span', innerText:'初测已经建立整体基线', outerHTML:'<span>初测已经建立整体基线</span>',
  closest:()=>owner, getBoundingClientRect:()=>({x:0,y:0,width:100,height:20})
};
installPicker(readElementSource);
listeners.get('window:click')({target,preventDefault:noop,stopPropagation:noop,stopImmediatePropagation:noop});
const pick = window.__dshWorkbenchPick;
assert.equal(pick.text,target.innerText);
assert.equal(pick.selection,undefined);
assert.deepEqual(pick.source,{file:'/project/miniprogram/pages/home/home.wxml',line:48});
assert.equal(readElementSource({closest:()=>null}),null);
assert.equal(readElementSource({closest:()=>({getAttribute:()=> 'invalid'})}),null);

const source = readFileSync(new URL('../src/client.js',import.meta.url),'utf8');
const helpers = source.slice(source.indexOf('    function noteText('),source.indexOf('    function addNote('));
const {blockFor} = vm.runInNewContext(helpers+'; ({blockFor})');
const note = {...pick,kind:'element',id:'test',comment:'什么意思',selection:'错误的残留选区'};
const block = blockFor(note);
assert.ok(block.includes(target.innerText));
assert.ok(!block.includes('错误的残留选区'));
assert.ok(block.includes('源码（WXML）：/project/miniprogram/pages/home/home.wxml:48'));
assert.ok(blockFor({...note,captureMode:'selection',selection:'明确划选的文字'}).includes('明确划选的文字'));
assert.ok(blockFor({kind:'context',selection:'会话选区',id:'context'}).includes('会话选区'));
console.log('Passed: stale selection, source location, explicit text selection, conversation selection');
