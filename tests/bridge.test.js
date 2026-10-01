const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const root = path.join(__dirname, '..');
const delay = ms => new Promise(r => setTimeout(r, ms));
async function setup(t, watch = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-'));
  const socketPath = path.join(dir, 'bridge.sock');
  if (watch) { fs.mkdirSync(path.join(dir,'extension')); fs.writeFileSync(path.join(dir,'extension','a.js'),'const a=1;'); fs.writeFileSync(path.join(dir,'extension','b.js'),'const b=1;'); }
  const env = { ...process.env, ANTIGRAVITY_SOCKET_PATH: socketPath, ANTIGRAVITY_DAEMON_LOG: path.join(dir,'daemon.log'), ANTIGRAVITY_EXTENSION_DIR: path.join(dir,watch?'extension':'absent') };
  const child = spawn(process.execPath, [path.join(root, 'browser-bridge/bridge-daemon.js')], { env, stdio:'pipe' });
  let errors='';child.stderr.on('data', b=>errors+=b);
  const sockets=[];
  t.after(async()=>{ sockets.forEach(s=>s.destroy()); child.kill(); await once(child,'exit').catch(()=>{}); fs.rmSync(dir,{recursive:true,force:true}); });
  for(let i=0; i<100 && !fs.existsSync(socketPath); i++) await delay(10);
  assert.equal(fs.existsSync(socketPath),true,errors);
  async function host(pid,email,ids) {
    const socket=net.createConnection(socketPath);sockets.push(socket);socket.setEncoding('utf8'); await once(socket,'connect');
    socket.write(JSON.stringify({type:'register',pid,profile:{email}})+'\n');
    let buffer='';let calls=[];let respond=true;
    socket.on('data',chunk=>{buffer+=chunk;let n;while((n=buffer.indexOf('\n'))!==-1){const msg=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);calls.push(msg);if(respond) socket.write(JSON.stringify({id:msg.id,result:msg.method==='list_tabs'?ids.map(id=>({id,title:'UTF8 😀'})):{success:true,profile:email}})+'\n');}});
    await delay(10);return {socket,calls,setRespond:v=>respond=v};
  }
  async function rpc(method,params={},split=false){
    const socket=net.createConnection(socketPath); sockets.push(socket);socket.setEncoding('utf8');await once(socket,'connect');
    const bytes=Buffer.from(JSON.stringify({id:'r',method,params})+'\n');
    if(split){const pos=bytes.indexOf(Buffer.from('😀'))+1;socket.write(bytes.subarray(0,pos));await delay(5);socket.write(bytes.subarray(pos));}else socket.write(bytes);
    let buffer='';return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{socket.destroy();reject(new Error('test timeout'));},1500);socket.on('data',chunk=>{buffer+=chunk;if(buffer.includes('\n')){clearTimeout(timeout);socket.end();resolve(JSON.parse(buffer.split('\n')[0]));}});socket.on('error',reject);});
  }
  return {dir,socketPath,env,child,host,rpc};
}
test('routing refuses unknown/ambiguous profile and absent/invalid/colliding tab IDs',async t=>{
  const b=await setup(t);const a=await b.host(101,'work@example.com',[1,3]);const c=await b.host(102,'personal@example.com',[2,3]);
  assert.match((await b.rpc('new_tab',{profile:'typo'})).error,/not connected/);
  assert.match((await b.rpc('new_tab',{profile:'example.com'})).error,/Ambiguous/);
  assert.match((await b.rpc('click',{tabId:999})).error,/not found/);
  assert.match((await b.rpc('click',{tabId:'1oops'})).error,/positive integer/);
  assert.match((await b.rpc('click',{tabId:3})).error,/ambiguous/);
  assert.equal((await b.rpc('click',{tabId:2})).result.profile,'personal@example.com');
  assert.equal(a.calls.filter(c=>c.method==='click').length,0);
});
test('UTF-8 split socket messages survive intact',async t=>{
 const b=await setup(t);const h=await b.host(101,'test@example.com',[1]);await b.rpc('type',{tabId:1,text:'😀'},true);
 assert.equal(h.calls.find(c=>c.method==='type').params.text,'😀');
});
test('host disconnect rejects immediately and replacement remains registered',async t=>{
 const b=await setup(t);const h=await b.host(101,'old@example.com',[1]);const newer=await b.host(101,'new@example.com',[1]);await delay(20);
 assert.equal((await b.rpc('status')).result.connectedProfiles[0].email,'new@example.com');
 newer.setRespond(false);const request=b.rpc('new_tab');await delay(20);newer.socket.destroy();assert.match((await request).error,/disconnected/);
});
test('duplicate daemon never unlinks active socket',async t=>{
 const b=await setup(t);await b.host(101,'test@example.com',[1]);const inode=fs.statSync(b.socketPath).ino;
 const duplicate=spawn(process.execPath,[path.join(root,'browser-bridge/bridge-daemon.js')],{env:b.env,stdio:'ignore'});assert.equal((await once(duplicate,'exit'))[0],0);
 assert.equal(fs.statSync(b.socketPath).ino,inode);assert.equal((await b.rpc('status')).result.connectedProfiles.length,1);
});
test('failed reload is accurately reported',async t=>{
 const b=await setup(t);const h=await b.host(101,'test@example.com',[1]);h.setRespond(false);const request=b.rpc('reload_extension');await delay(20);h.socket.destroy();const result=(await request).result;
 assert.equal(result.success,false);assert.equal(result.reloadedProfiles.length,0);assert.equal(result.failedProfiles.length,1);
});
test('MCP rejects unknown tools/types and flags failed operation results',async t=>{
 const b=await setup(t);const h=await b.host(101,'test@example.com',[1]);h.setRespond(false);
 h.socket.on('data',chunk=>{for(const line of chunk.trim().split('\n')){const msg=JSON.parse(line);h.socket.write(JSON.stringify({id:msg.id,result:msg.method==='list_tabs'?[{id:1}]:{success:false,error:'encoder failed'}})+'\n');}});
 const child=spawn(process.execPath,[path.join(root,'browser-bridge/mcp-server.js')],{env:b.env,stdio:'pipe'});t.after(()=>child.kill());let output='';child.stdout.setEncoding('utf8');child.stdout.on('data',c=>output+=c);
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'browser_typo'}})+'\n');
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'browser_type',arguments:{tabId:1,text:123}}})+'\n');
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'browser_record_stop',arguments:{tabId:1}}})+'\n');
 for(let i=0;i<100 && output.trim().split('\n').length<3;i++)await delay(10);
 const results=output.trim().split('\n').map(JSON.parse);assert.equal(results.length,3);for(const r of results)assert.equal(r.result.isError,true);
});
test('CLI validates malformed tab IDs before contacting daemon',async()=>{
 const child=spawn(process.execPath,[path.join(root,'browser-bridge/cli.js'),'close','12oops'],{stdio:'pipe'});let error='';child.stderr.on('data',b=>error+=b);const [code]=await once(child,'exit');
 // parseInt previously accepted this input: use CLI strict numeric parsing.
 assert.equal(code,1);assert.match(error,/positive integer/);
});

test('watcher never reloads an invalid source after another file changes',async t=>{
 const b=await setup(t,true);const h=await b.host(101,'test@example.com',[1]);const ext=path.join(b.dir,'extension');
 fs.writeFileSync(path.join(ext,'a.js'),'const = invalid');await delay(700);
 fs.writeFileSync(path.join(ext,'b.js'),'const b=2;');await delay(700);
 assert.equal(h.calls.filter(c=>c.method==='reload_extension').length,0);
 fs.writeFileSync(path.join(ext,'a.js'),'const a=2;');await delay(700);
 assert.equal(h.calls.filter(c=>c.method==='reload_extension').length,1);
});
test('literal --force text never implicitly claims a user tab',async t=>{
 const b=await setup(t);const h=await b.host(101,'test@example.com',[1]);const child=spawn(process.execPath,[path.join(root,'browser-bridge/cli.js'),'type','1','--force'],{env:b.env,stdio:'pipe'});
 assert.equal((await once(child,'exit'))[0],0);const request=h.calls.find(c=>c.method==='type');assert.equal(request.params.text,'--force');assert.equal(request.params.allowExistingTab,undefined);
});

test('CLI exits nonzero for failed operation results',async t=>{
 const b=await setup(t);const h=await b.host(101,'test@example.com',[1]);h.setRespond(false);h.socket.on('data',chunk=>{for(const line of chunk.trim().split('\n')){const msg=JSON.parse(line);h.socket.write(JSON.stringify({id:msg.id,result:msg.method==='list_tabs'?[{id:1}]:{success:false,error:'recording failed'}})+'\n');}});
 const child=spawn(process.execPath,[path.join(root,'browser-bridge/cli.js'),'record-stop','1'],{env:b.env,stdio:'pipe'});let error='';child.stderr.on('data',b=>error+=b);assert.equal((await once(child,'exit'))[0],1);assert.match(error,/recording failed/);
});
