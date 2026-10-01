const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function event() { const listeners = new Set(); return { addListener: f => listeners.add(f), removeListener: f => listeners.delete(f), emit: (...a) => [...listeners].map(f => f(...a)), listeners }; }
async function worker(options = {}) {
  const commands = [], messages = [], removed = [];
  const tabs = [{ id: 1, status: 'complete', url: 'https://test.invalid', title: 'Test' }, { id: 2, status: 'complete' }];
  const chrome = {
    storage: { session: { get: async () => options.stored || {}, set: async data => { chrome.saved = data; } }, local: { get: async () => ({}), set: async () => {} } },
    runtime: { id: 'test', onInstalled: event(), onMessage: event(), connectNative: () => ({ onMessage: event(), onDisconnect: event(), postMessage: msg => messages.push(msg) }), reload() {} },
    tabs: { query: async () => tabs, get: async id => { if (options.get) return options.get(id, chrome); const t = tabs.find(t => t.id === id); if (!t) throw new Error('No tab'); return t; }, onUpdated: event(), onRemoved: event(), sendMessage: async () => ({ ok: true }), remove: async id => removed.push(id), create: async () => tabs[0], update: async (id, change) => ({ ...tabs.find(t => t.id === id), ...change }) },
    scripting: { executeScript: async () => {} }, action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    debugger: { onEvent: event(), onDetach: event(), attach: (_, __, cb) => cb(), detach: async () => {}, sendCommand: (target, method, args, cb) => {
      commands.push({ target, method, args });
      cb(options.command?.(method, args) || (method === 'Runtime.evaluate' ? { result: { value: { ok: true, consumed: false, editable: true } } } : {}));
    } }
  };
  const context = vm.createContext({ chrome, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Date, crypto: require("node:crypto").webcrypto });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-extension/background.js'), 'utf8'), context);
  await vm.runInContext('ownershipReady', context);
  return { chrome, commands, messages, removed, run: code => vm.runInContext(code, context), context };
}
test('cleanup only closes created tabs, retaining claimed/legacy tabs', async () => {
  const w = await worker({ stored: { agentOwnedTabs: [1, 2, 999], agentCreatedTabs: [2] } });
  await w.run('closeAgentTabs()');
  assert.deepEqual(w.removed, [2]);
  assert.equal(w.run('agentOwnedTabs.has(1)'), true);
  assert.equal(w.run('agentOwnedTabs.has(999)'), false);
});
test('double click sends both press/release pairs and correct counts', async () => {
  const w = await worker(); await w.run('clickElement({tabId:1,x:0,y:0,dblClick:true})');
  assert.deepEqual(w.commands.filter(c => c.method === 'Input.dispatchMouseEvent').map(c => [c.args.type, c.args.clickCount]), [['mouseMoved', undefined], ['mousePressed', 1], ['mouseReleased', 1], ['mousePressed', 2], ['mouseReleased', 2]]);
});
test('shortcut has no insertion text, Space uses actual space key', async () => {
  const w = await worker(); await w.run('pressKey({tabId:1,key:"a",ctrl:true})'); await w.run('pressKey({tabId:1,key:"Space"})');
  const keys = w.commands.filter(c => c.method === 'Input.dispatchKeyEvent');
  assert.equal(keys[0].args.text, undefined); assert.deepEqual(Array.from(keys[0].args.commands), ['selectAll']); assert.equal(keys[2].args.key, ' ');
});
test('ordinary paste inserts once and never writes system clipboard', async () => {
  const w = await worker(); await w.run('pasteClipboard({tabId:1,text:"hello"})');
  assert.equal(w.commands.filter(c => c.method === 'Input.insertText').length, 1);
  assert.equal(w.commands.filter(c => c.method === 'Input.dispatchKeyEvent').length, 0);
  assert.equal(w.commands.find(c => c.method === 'Runtime.evaluate').args.expression.includes('navigator.clipboard'), false);
});
test('handled paste event avoids duplicate insertion; editor refusal errors', async () => {
  const w = await worker({ command: method => method === 'Runtime.evaluate' ? { result: { value: { ok: true, consumed: true } } } : null });
  await w.run('pasteClipboard({tabId:1,text:"table",html:"<table></table>"})');
  assert.equal(w.commands.filter(c => c.method === 'Input.insertText').length, 0);
  const unsupported = await worker({ command: method => method === 'Runtime.evaluate' ? { result: { value: { ok: true, consumed: false, editable: false } } } : null });
  await assert.rejects(unsupported.run('pasteClipboard({tabId:1,text:"x"})'), /did not handle/);
});
test('navigation completion race is handled and timeout rejects', async () => {
  const w = await worker({ get: async (id, chrome) => { chrome.tabs.onUpdated.emit(id, { status: 'complete' }); return { id, status: 'loading' }; } });
  await w.run('waitForTabComplete(1,20)'); assert.equal(w.chrome.tabs.onUpdated.listeners.size, 1); // persistent cursor listener only
  const stalled = await worker({ get: async id => ({ id, status: 'loading' }) });
  await assert.rejects(stalled.run('waitForTabComplete(1,5)'), /did not finish/);
});
test('snapshot generations do not reuse UID and navigation invalidates map', async () => {
  const w = await worker({ command: method => method === 'Accessibility.getFullAXTree' ? { nodes: [{ role: { value: 'slider' }, name: { value: 'Volume' }, value: { value: 50 }, backendDOMNodeId: 10 }] } : null });
  const first = await w.run('takeSnapshot({tabId:1})'); const second = await w.run('takeSnapshot({tabId:1})');
  assert.match(first.tree, /value="50"/); assert.notEqual(first.tree, second.tree);
  const oldUid = first.tree.match(/uid=(\S+)/)[1];
  await assert.rejects(w.run(`resolveElementCoords(1,${JSON.stringify(oldUid)})`), /fresh/);
  w.chrome.tabs.onUpdated.emit(1, { status: 'loading' }, {});
  assert.equal(w.run('tabSnapshots.has(1)'), false);
});
test('debugger attachment is deduplicated', async () => {
  const w = await worker(); await w.run('Promise.all([ensureDebugger(1),ensureDebugger(1)])');
  assert.equal(w.commands.filter(c => c.method === 'Page.enable').length, 1);
});
test('batch preflight rejects unknown and cross-tab actions before executing', async () => {
  const w = await worker(); await assert.rejects(w.run('runActions({tabId:1,actions:[{type:"type",text:"x"},{type:"bad"}]})'), /Invalid/);
  await assert.rejects(w.run('runActions({tabId:1,actions:[{type:"click",tabId:2,x:1,y:1}]})'), /one tab/);
  assert.equal(w.commands.length, 0);
});
test('failed recorded batch always finalizes and includes completed count', async () => {
  const w = await worker(); w.run('agentOwnedTabs.add(1); startRecording=async()=>({success:true}); stopRecording=async()=>{globalThis.stopped=true;return {success:true}}; typeText=async()=>{throw new Error("lost focus")}');
  await assert.rejects(w.run('runActions({tabId:1,record:true,actions:[{type:"type",text:"x"}]})'), /0\/1.*lost focus/);
  assert.equal(w.run('stopped'), true);
});
test('same-tab requests are sequential and RPC rejects invalid IDs', async () => {
  const w = await worker(); w.run('globalThis.order=[]; evaluateScript=async p=>{order.push("start"+p.expression);await new Promise(r=>setTimeout(r,5));order.push("end"+p.expression);return {}};agentOwnedTabs.add(1)');
  await w.run('Promise.all([handleRequest({id:"a",method:"evaluate",params:{tabId:1,expression:"a"}}),handleRequest({id:"b",method:"evaluate",params:{tabId:1,expression:"b"}})])');
  assert.deepEqual(Array.from(w.run('order')), ['starta', 'enda', 'startb', 'endb']);
  await w.run('handleRequest({id:"bad",method:"type",params:{tabId:"1oops",text:"x"}})');
  assert.match(w.messages.find(m => m.id === 'bad').error, /positive integer/);
});
test('PNG excludes quality and full page specifies content clip', async () => {
  const w = await worker({ command: method => method === 'Page.getLayoutMetrics' ? { cssContentSize: { width: 1000, height: 4000 } } : null });
  await w.run('captureScreenshot({tabId:1,format:"png",fullPage:true})'); const capture = w.commands.find(c => c.method === 'Page.captureScreenshot').args;
  assert.equal(capture.quality, undefined); assert.equal(capture.clip.height, 4000);
});
test('locator combines role and text safely, skips hidden nodes', async () => {
  const w = await worker(); await assert.rejects(w.run('findAndClick({tabId:1,role:"button",text:"Save"})'), /not found/);
  const expression = w.commands.find(c => c.method === 'Runtime.evaluate').args.expression;
  const make = (name, role, width) => ({ tagName:'BUTTON', disabled:false, innerText:name, getAttribute:k=>k==='role'?role:null, getBoundingClientRect:()=>({left:0,top:0,width,height:10}), contains:()=>false, scrollIntoView(){} });
  const value = vm.runInNewContext(expression, { document: { querySelectorAll:()=>[make('Save','button',0),make('Save','link',10),make('Save','button',10)] }, getComputedStyle:()=>({visibility:'visible',display:'block'}) });
  assert.equal(value.found, true); assert.equal(value.x, 5);
});
test('popup status describes actual port state and attached count', async()=>{
  const w=await worker();let reply;w.chrome.runtime.onMessage.emit({type:'GET_BRIDGE_STATUS'},{id:'test'},value=>reply=value);assert.equal(reply.nativeConnected,true);assert.equal(reply.attachedTabCount,0);
  await w.run('ensureDebugger(1)');w.chrome.runtime.onMessage.emit({type:'GET_BRIDGE_STATUS'},{id:'test'},value=>reply=value);assert.equal(reply.attachedTabCount,1);
  w.run('nativePort=null');w.chrome.runtime.onMessage.emit({type:'GET_BRIDGE_STATUS'},{id:'test'},value=>reply=value);assert.equal(reply.nativeConnected,false);
});
test('cursor stops scheduling frames at rest and recovers removed overlay',()=>{
  let scheduled=[],root,listener;
  const element=()=>({style:{},dataset:{},classList:{add(){},remove(){}},isConnected:false,setAttribute(){},appendChild(el){el.isConnected=true;},remove(){this.isConnected=false;},querySelector(){return element();},attachShadow(){return element();}});
  const document={createElement:()=>element(),getElementById:()=>root?.isConnected?root:null,documentElement:{appendChild(el){root=el;el.isConnected=true;}}};
  const context=vm.createContext({document,window:{},chrome:{runtime:{onMessage:{addListener:f=>listener=f},sendMessage:async()=>({ok:true,state:{isVisible:false,cursor:null}})}},requestAnimationFrame:f=>{scheduled.push(f);return scheduled.length;},cancelAnimationFrame(){}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../browser-extension/content-scripts/cursor.js'),'utf8'),context);
  assert.equal(scheduled.length,1);scheduled.shift()();assert.equal(scheduled.length,0);
  listener({type:'AGENT_CURSOR_STATE',state:{isVisible:true,cursor:{x:400,y:300}}},null,()=>{});
  let ticks=0;while(scheduled.length&&ticks<200){scheduled.shift()();ticks++;}assert.equal(scheduled.length,0);assert.ok(ticks<200);
  const oldRoot=root;oldRoot.remove();listener({type:'CONTENT_PING'},null,()=>{});assert.notEqual(root,oldRoot);assert.equal(root.isConnected,true);
});

test('worker lifecycle changes cannot reuse old snapshot UIDs',async()=>{
 const options={command:method=>method==='Accessibility.getFullAXTree'?{nodes:[{role:{value:'button'},name:{value:'Save'},backendDOMNodeId:10}]}:null};
 const first=await worker(options),second=await worker(options);const a=await first.run('takeSnapshot({tabId:1})'),b=await second.run('takeSnapshot({tabId:1})');assert.notEqual(a.tree,b.tree);
});
