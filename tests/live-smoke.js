#!/usr/bin/env node
// Opt-in live check. Creates and closes exactly one local-fixture tab; no global cleanup.
const net = require('node:net');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const socketPath = process.env.ANTIGRAVITY_SOCKET_PATH || '/tmp/antigravity-browser-bridge.sock';
const profile = process.argv[2];
if (!profile) { console.error('Usage: node tests/live-smoke.js <exact-connected-profile>'); process.exit(1); }
function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath); socket.setEncoding('utf8');
    const id = `smoke_${Date.now()}_${Math.random()}`;
    const timer = setTimeout(() => { socket.destroy(); reject(new Error(`${method} timed out; outcome may be unknown`)); }, 95000);
    let settled = false, buffer = '';
    const finish = (err, value) => { if (settled) return; settled = true; clearTimeout(timer); socket.end(); err ? reject(err) : resolve(value); };
    socket.on('connect', () => socket.write(JSON.stringify({ id, method, params }) + '\n'));
    socket.on('error', err => finish(err));
    socket.on('close', () => { if (!settled) finish(new Error('Bridge disconnected')); });
    socket.on('data', chunk => { buffer += chunk; if (buffer.includes('\n')) { try { const r = JSON.parse(buffer.split('\n')[0]); if (r.id === id) finish(r.error ? new Error(r.error) : null, r.result); } catch (err) { finish(err); } } });
  });
}
(async () => {
  const assert = require('node:assert/strict');
  const html = `<!doctype html><meta charset=utf-8><title>Bridge local regression fixture</title>
  <input id=field value=original><button id=btn>Fixture action</button><button id=hidden style="display:none">Fixture action</button>
  <div id=result></div><div style="height:4000px">Scroll fixture</div><script>
  window.clicks=0;window.doubles=0;window.pastes=0;btn.onclick=()=>{clicks++;result.textContent=clicks};btn.ondblclick=()=>doubles++;field.addEventListener('paste',()=>pastes++);
  </script>`;
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-live-check-'));
  let tabId;
  const checks = [];
  const evaluate = async expression => (await rpc('evaluate', { tabId, expression })).value;
  try {
    const created = await rpc('new_tab', { profile, url: `http://127.0.0.1:${server.address().port}/` }); tabId = created.tabId;
    assert.equal(created.active, false); checks.push('background tab');
    await rpc('find_and_click', { tabId, selector: '#field' });
    await rpc('type', { tabId, text: 'Typed 😀', clear: true }); assert.equal(await evaluate('field.value'), 'Typed 😀'); checks.push('clear/type UTF-8');
    await rpc('press_key', { tabId, key: 'Space' }); assert.equal(await evaluate('field.value'), 'Typed 😀 '); checks.push('Space key');
    await rpc('paste', { tabId, text: 'pasted' }); assert.equal(await evaluate('field.value'), 'Typed 😀 pasted'); assert.equal(await evaluate('pastes'), 1); checks.push('plain paste once');
    await rpc('find_and_click', { tabId, selector: '#btn', dblClick: true });
    assert.equal(await evaluate('clicks'), 2); assert.equal(await evaluate('doubles'), 1); checks.push('double click');
    const snapshot = await rpc('snapshot', { tabId }); const uid = snapshot.tree.match(/uid=(\S+) button "Fixture action"/)[1]; assert.match(uid, /^\d+_[a-zA-Z0-9-]+_\d+$/);
    await rpc('click', { tabId, uid }); assert.equal(await evaluate('clicks'), 3); checks.push('snapshot UID click');
    await rpc('snapshot', { tabId }); await assert.rejects(rpc('click', { tabId, uid }), /fresh/); checks.push('stale UID rejection');
    const batch = await rpc('run_actions', { tabId, actions: [{ type: 'click', selector: '#field' }, { type: 'type', text: 'batch-value', clear: true }] });
    assert.equal(batch.success, true); assert.equal(await evaluate('field.value'), 'batch-value'); checks.push('sequential batch');
    const shot = await rpc('screenshot', { tabId, format: 'png', fullPage: true }); const shotPath = path.join(dir, 'full-page.png'); fs.writeFileSync(shotPath, Buffer.from(shot.dataBase64, 'base64'));
    const png = fs.readFileSync(shotPath); assert.ok(png.readUInt32BE(20) >= 4000); checks.push('full-page PNG >=4000px');
    const videoPath = path.join(dir, 'workflow.mp4');
    const recording = await rpc('run_actions', { tabId, record: true, outputPath: videoPath, actions: [{ type: 'scroll', deltaY: 400 }, { type: 'wait', ms: 400 }, { type: 'scroll', deltaY: -400 }] });
    assert.equal(recording.success, true, JSON.stringify(recording.video)); assert.equal(recording.video.success, true); assert.ok(fs.statSync(videoPath).size > 0);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-show_entries', 'format=duration', '-of', 'json', videoPath], { encoding: 'utf8' }));
    assert.equal(probe.streams[0].codec_name, 'h264'); assert.ok(Number(probe.format.duration) > 0); checks.push('recording and ffprobe H264');
    console.log(JSON.stringify({ success: true, profile, checks, screenshot: { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }, video: probe, artifacts: dir }, null, 2));
  } finally {
    if (tabId) await rpc('close_tab', { tabId }).catch(err => console.error(`Could not close test tab ${tabId}: ${err.message}`));
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
})().catch(err => { console.error(err.stack); process.exitCode = 1; });
