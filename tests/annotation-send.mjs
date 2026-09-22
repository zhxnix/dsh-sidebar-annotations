import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../src/client.js', import.meta.url),'utf8');
const logic = source.slice(source.indexOf('    function noteText('),source.indexOf('    const button ='));
const stores = new Map();
const storeFor = id => {if (!stores.has(id)) stores.set(id,{notes:[]});return stores.get(id);};
const publish = (id,notes) => {storeFor(id).notes=notes;};
let draft='用户正文', writes=0;
const input={state:{getSnapshot:()=>({draft})},setDraft:text=>{writes++;draft=text;}};
const api=vm.runInNewContext(logic+';({addNote,updateNote,removeNote,installAnnotationSend,migrateDraftNotes})',{
 storeFor,publish,currentSession:()=> 'a',inputFor:()=>input,crypto:{randomUUID:()=> 'note-1234-abcd'}
});
api.addNote({text:'准确原文',kind:'element',comment:'解释'});
assert.equal(writes,0);assert.equal(draft,'用户正文');
api.updateNote('a',storeFor('a').notes[0],'改后的意见');assert.equal(writes,0);
let finish, sent;
const service={sendSession:async(session,text,files,mode)=>{sent={session,text,files,mode};return await new Promise(resolve=>finish=resolve);}};
const original=service.sendSession,cleanup=api.installAnnotationSend(service);
const pending=service.sendSession({sessionId:'a'},draft,['file-id'],'steer');
assert.ok(sent.text.startsWith('用户正文\n\n【注释'));assert.ok(sent.text.includes('改后的意见'));assert.equal(sent.mode,'steer');
assert.equal(storeFor('a').notes.length,0);assert.equal(writes,0);
publish('a',[{id:'new',text:'新注释'}]);finish({kind:'error'});await pending;
assert.equal(storeFor('a').notes.length,2);assert.equal(storeFor('a').notes[1].id,'new');
const retry=service.sendSession({sessionId:'a'},draft,[],'queue');finish({kind:'success'});await retry;
assert.equal(storeFor('a').notes.length,0);
publish('a',[{id:'only-a',text:'A'}]);const other=service.sendSession({sessionId:'b'},'B',[],'queue');assert.equal(sent.text,'B');finish({kind:'success'});await other;
assert.equal(storeFor('a').notes.length,1);cleanup();assert.equal(service.sendSession,original);
console.log('Passed: hidden notes, edit, send payload, failure restore, new notes, session isolation, cleanup');
