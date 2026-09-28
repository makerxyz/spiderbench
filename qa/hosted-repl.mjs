// Task-owned, headless acceptance console. Credentials stay in memory and are never printed.
// Usage: node qa/hosted-repl.mjs <canonical play URL>
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';
const evidenceDir = path.resolve('qa/evidence');
await mkdir(evidenceDir, { recursive: true });
const credentials = JSON.parse(await readFile(path.join(os.homedir(), '.helix/credentials.json'), 'utf8'));
const apiBase = credentials.apiUrl.replace(/\/$/, '');
async function api(route, init = {}) {
  const r = await fetch(apiBase + route, { ...init, headers: { Authorization: `Bearer ${credentials.token}`, ...(init.headers ?? {}) } });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${route}: HTTP ${r.status}`);
  return d?.item ?? d?.items ?? d;
}
const evidence = { pageErrors: [], httpErrors: [], logs: [], navigations: [], transportEvents: [], checkpoints: {} };
const beforePlacements = await api('/api/v1/worlds/spiderbench/spawned-items');
const beforeIds = new Set(beforePlacements.map(v => v.placementId));
const slots = await api('/api/v1/universal-items/quick-slots/me');
const vehicleSlot = Object.entries(slots.slots).find(([, v]) => v?.kind === 'vehicle' && v.restingAt?.type === 'inventory');
const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : ['--enable-gpu'] });
await writeFile(path.join(evidenceDir, 'hosted.pid'), String(process.pid));
let context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
// Iterate against the authentic shell without publishing every diagnostic build.
// Acceptance of a release must run without --local so it exercises the CDN bytes.
if (process.argv.includes('--local')) {
  const root = path.resolve('dist');
  const mime = { '.js': 'application/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.ttf': 'font/ttf' };
  await context.route('https://eu.instant-worlds.dev.helix-cdn.com/instant-worlds/39a4718b-37bd-4250-981c-b9b96533f9f7/**', async route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).split('/').slice(4).join('/');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) return route.abort();
    try { await route.fulfill({ status: 200, contentType: mime[path.extname(file)] ?? 'application/octet-stream', body: await readFile(file), headers: { 'access-control-allow-origin': '*' } }); }
    catch { await route.fulfill({ status: 404, body: 'Local build file missing' }); }
  });
  evidence.runtimeSource = 'local dist in authenticated hosted shell';
} else evidence.runtimeSource = 'published CDN build';
let page = await context.newPage(), frame = null;
function observe(p) {
  p.on('framenavigated', f => { if (/instant-worlds/.test(f.url())) { evidence.navigations.push({ at: Date.now(), url: f.url() }); console.log('WORLD_FRAME', f.url()); } });
  p.on('pageerror', e => { evidence.pageErrors.push(e.message); console.log('PAGEERROR', e.message); });
  p.on('response', r => { if (r.status() >= 400) evidence.httpErrors.push({ url: r.url().split('?')[0], status: r.status() }); });
  p.on('console', m => {
    if (m.text().startsWith('[qa-transport] ')) {
      try { evidence.transportEvents.push(JSON.parse(m.text().slice('[qa-transport] '.length))); } catch {}
    }
    if (/warmup|city|systems|\[profile\]|shared-room|shell-probe|qa-transport|colyseus|onDrop|onReconnect|onLeave/i.test(m.text()) || m.type() === 'error') { evidence.logs.push(m.text()); console.log(m.text()); }
  });
}
observe(page);
await context.addInitScript(() => {
  const safeUrl = value => { try { const u = new URL(value); return u.host + u.pathname; } catch { return 'unparseable'; } };
  const emit = (type, data) => console.info('[qa-transport]', JSON.stringify({ at: Date.now(), frame: window.top === window ? 'parent' : 'child', type, ...data }));
  const NativeWebSocket = window.WebSocket;
  window.WebSocket = new Proxy(NativeWebSocket, {
    construct(Target, args) {
      const socket = Reflect.construct(Target, args);
      const url = safeUrl(args[0]);
      socket.addEventListener('close', event => emit('websocket-close', { url, code: event.code, reason: event.reason, wasClean: event.wasClean }));
      socket.addEventListener('error', () => emit('websocket-error', { url }));
      return socket;
    },
  });
  try { new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.duration >= 250) emit('longtask', { durationMs: Math.round(entry.duration) }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  addEventListener('message', e => {
    if (window.top === window && e.data?.type === 'helix:multiplayer-state') {
      const iframe = document.querySelector('iframe[src*="instant-worlds"]');
      emit('multiplayer-state', { currentIframe: e.source === iframe?.contentWindow, iframeUrl: iframe ? safeUrl(iframe.src) : null, roomId: e.data.state?.roomId ?? null, playerCount: e.data.state?.playerCount ?? null });
    }
    if (window.top !== window && e.data?.type === 'helix:leave') emit('leave-message', {});
  });
});
await page.goto('https://new.helixgame.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(async c => {
  const csrf = await (await fetch('/api/auth/csrf')).json();
  await fetch('/api/auth/callback/sso-tokens', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: '/', access_token: c.token, refresh_token: c.refreshToken ?? '', expires_in: '3600' }), redirect: 'manual' });
}, credentials);
const playUrl = process.argv[2];
if (!playUrl?.startsWith('https://new.helixgame.com/')) throw new Error('Use the canonical helix3 publish URL');
await page.goto(playUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
async function findWorld() {
  frame = page.frames().find(f => /instant-worlds\//.test(f.url()) && /index\.html/.test(f.url())) ?? null;
  return page.frames().map(f => f.url());
}
async function ready() {
  const deadline = Date.now() + 600000;
  while (!frame && Date.now() < deadline) { await findWorld(); if (!frame) await page.waitForTimeout(1000); }
  if (!frame) throw new Error('No world iframe');
  await frame.waitForFunction(() => window.__ctx?.framesDrawn >= 4 && (!document.querySelector('#boot') || document.querySelector('#boot').classList.contains('out')), null, { timeout: Math.max(1, deadline - Date.now()) });
  return state();
}
async function state() {
  return frame.evaluate(() => { const c = window.__ctx, p = c.player; return { frames: c.framesDrawn, avatar: p.mp.avatarSource, position: p.body.position, velocity: p.velocity, mode: p.mode, contexts: c.input.router.activeContexts(), conflicts: c.input.router.conflicts(), fleet: p.mp.portableVehicleEvidence(), seating: p.mp.seatEvidence(), model: p.mp.local.model.name, activeAbilities: p.mp.local.abilities.activeIds() }; });
}
async function shot(name) { const file = path.join(evidenceDir, `${name}.png`); await page.screenshot({ path: file, timeout: 60000 }); return file; }
async function checkpoint(name, value) { evidence.checkpoints[name] = value ?? await state(); await writeFile(path.join(evidenceDir, 'hosted.json'), JSON.stringify(evidence, null, 2)); return evidence.checkpoints[name]; }
async function advance(n = 10) { const start = await frame.evaluate(() => __ctx.framesDrawn); await frame.waitForFunction(s => __ctx.framesDrawn >= s.n + s.delta, { n: start, delta: n }, { timeout: 120000 }); }
async function wheelSlot(slot) {
  await page.keyboard.down('g');
  const petal = frame.locator(`[data-helix-quick-slot-wheel] [data-sector="${Number(slot.slice(1))}"]`);
  await petal.waitFor({ state: 'visible', timeout: 20000 }); await petal.hover(); await page.keyboard.up('g');
}
async function cleanup() {
  try {
    const current = await api('/api/v1/worlds/spiderbench/spawned-items');
    for (const placed of current) if (!beforeIds.has(placed.placementId) && placed.instanceId === vehicleSlot?.[1].instanceId) await api(`/api/v1/universal-items/inventory/me/${placed.instanceId}/spawn`, { method: 'DELETE' });
    await checkpoint('cleanup', { remainingTaskPlacements: (await api('/api/v1/worlds/spiderbench/spawned-items')).filter(v => !beforeIds.has(v.placementId) && v.instanceId === vehicleSlot?.[1].instanceId).length });
  } finally {
    await context.close(); await browser.close();
    await unlink(path.join(evidenceDir, 'hosted.pid')).catch(() => {});
  }
}
process.on('SIGTERM', () => { void cleanup().finally(() => process.exit(0)); });
console.log('CONSOLE_READY', JSON.stringify({ playUrl, vehicleSlot: vehicleSlot?.[0], vehicle: vehicleSlot?.[1].title }));
const lines = createInterface({ input: process.stdin, terminal: false });
for await (const line of lines) {
  try { const result = await eval(`(async()=>{${line}})()`); console.log('RESULT', JSON.stringify(result ?? null)); }
  catch (error) { console.log('ERROR', error.stack); }
}
await cleanup();
