import assert from 'node:assert/strict';
import {installPicker} from '../lib/picker.js';

const windowListeners = new Map();
const documentListeners = new Map();
const created = [];
const root = {
  appendChild(node) { node.parentNode = this; created.push(node); },
  removeChild(node) {
    const index = created.indexOf(node);
    if (index >= 0) created.splice(index, 1);
    node.parentNode = null;
  }
};

function fakeNode() {
  const listeners = new Map();
  return {
    nodeType:1,
    style:{},
    attributes:{},
    parentNode:null,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); },
    getAttribute(name) { return this.attributes[name] || null; },
    contains(node) { return node === this; },
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
    listeners
  };
}

const anchor = {
  nodeType:1,
  localName:'a',
  innerText:'打开下一页',
  textContent:'打开下一页',
  outerHTML:'<a href="/next">打开下一页</a>',
  classList:[],
  previousElementSibling:null,
  parentElement:null,
  closest:()=>null,
  getBoundingClientRect:()=>({x:40,y:60,left:40,top:60,right:180,bottom:92,width:140,height:32})
};

globalThis.document = {
  title:'Mini preview',
  createElement:()=>fakeNode(),
  documentElement:root,
  elementsFromPoint:()=>[anchor],
  addEventListener:(name, fn)=>documentListeners.set(name, fn),
  removeEventListener:(name)=>documentListeners.delete(name),
  querySelectorAll:()=>[]
};
globalThis.window = {
  location:{href:'http://localhost:4173/'},
  addEventListener:(name, fn)=>windowListeners.set(name, fn),
  removeEventListener:(name)=>windowListeners.delete(name)
};

const picker = installPicker(() => ({file:'/project/pages/home/home.wxml', line:48}));
const captureLayer = created[0];
assert.equal(captureLayer.style.pointerEvents, 'auto');
assert.equal(captureLayer.style.touchAction, 'none');

function eventAt(x, y) {
  return {
    clientX:x,
    clientY:y,
    button:0,
    target:captureLayer,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
    stopImmediatePropagation() { this.immediateStopped = true; }
  };
}

// The real pointer is received by the transparent layer/window guard, while
// the selected element comes from elementsFromPoint.  The underlying anchor
// therefore cannot navigate or run its click handler.
const down = eventAt(70, 70);
windowListeners.get('pointerdown')(down);
assert.equal(down.defaultPrevented, true);
assert.equal(down.immediateStopped, true);
assert.equal(window.__dshWorkbenchPick.text, '打开下一页');
assert.equal(window.__dshWorkbenchPick.captureMode, 'element');
assert.equal(window.__dshWorkbenchPickerActive, true);
assert.equal(window.__dshWorkbenchPickerLocked, true);
assert.equal(picker.isLocked(), true);

// While the editor is open, even a subsequent click is consumed and cannot
// re-trigger the page control.  The host releases the lock after save/cancel.
const click = eventAt(70, 70);
windowListeners.get('click')(click);
assert.equal(click.defaultPrevented, true);
assert.equal(window.__dshWorkbenchPick.text, '打开下一页');
picker.stop();
assert.equal(window.__dshWorkbenchPickerActive, false);
assert.equal(window.__dshWorkbenchPickerLocked, false);
assert.equal(picker.isLocked(), false);
assert.equal(created.includes(captureLayer), false);

console.log('Passed: transparent pointer capture, control activation blocking, selection lock lifecycle');
