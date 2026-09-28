import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInput } from '../src/player/input.js';
import { createCombatInput } from '../src/game/combat/input.js';
import { createFlow } from '../src/game/systems/flow.js';
import { InputService } from '../public/helix_modules/humanoid-character/index.js';
globalThis.document = { getElementById: () => null, addEventListener() {} };
function setup() {
  const router = new InputService({ getGamepads: () => [] });
  const input = createInput(null, { router, attach: false });
  router.registerAction('move', { kind: 'vec2', composite: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'] } });
  router.registerAction('look', { kind: 'vec2' });
  router.registerAction('jump', { kind: 'button', keys: ['Space'] });
  router.registerAction('sprint', { kind: 'button', keys: ['ShiftLeft'] });
  router.registerAction('primary', { kind: 'button', mouseButtons: [0], gamepadButtons: [7] });
  router.registerAction('secondary', { kind: 'button', mouseButtons: [2], gamepadButtons: [6] });
  router.registerAction('reload', { kind: 'button', keys: ['KeyR'], gamepadButtons: [3] });
  input.setOnFoot(true); input.updateMobile();
  return { router, input, tick(dt = 1 / 60) { router.update(dt); input.updateUI(dt); return input.poll(dt); } };
}
test('one canonical frame preserves sub-frame traversal press and release', () => {
  const { input, tick } = setup(); input.press('KeyR'); input.release('KeyR');
  assert.equal(tick().zipPressed, true); assert.equal(tick().zipReleased, true);
});
test('poll does not pump or consume shared router edges', () => {
  const { router, input, tick } = setup(); input.press('KeyR'); tick();
  assert.equal(router.wasPressed('reload'), true); input.poll();
  assert.equal(router.wasPressed('reload'), true);
});
test('native wheel gates movement, traversal, combat and game menu keys', () => {
  const { router, input, tick } = setup(); router.pushContext('weapon-wheel');
  for (const key of ['KeyW', 'KeyR', 'F10', 'MouseLeft']) input.press(key);
  const state = tick(); assert.equal(state.move.y, 0); assert.equal(state.zip, false);
  assert.equal(router.wasPressed('spider.menu'), false);
  const combat = createCombatInput(() => 0, () => 0, input); combat.enabled = true; combat.poll(); assert.equal(combat.has('attack'), false);
});
test('touch virtual swing uses identical edges and menu gate', () => {
  const { router, tick } = setup(); router.setVirtualButton('spider.swing', true);
  assert.equal(tick().swingPressed, true); router.pushContext('spider.menu'); assert.equal(tick().swing, false);
});
test('slingshot chord suppresses swing and combat attack', () => {
  const { input, tick } = setup(); input.sling.gate = true;
  input.press('ControlLeft'); input.press('MouseLeft'); input.press('MouseRight');
  const state = tick(); assert.equal(state.slingL, true); assert.equal(state.slingR, true); assert.equal(state.swing, false);
  const combat = createCombatInput(() => 0, () => 0, input); combat.enabled = true; combat.poll(); assert.equal(combat.has('attack'), false);
});
test('combat buffered taps and launcher hold use shared frame', () => {
  const { input, tick } = setup(); let now = 0; const combat = createCombatInput(() => now, () => now, input); combat.enabled = true;
  input.press('MouseLeft'); tick(); combat.poll(); assert.equal(combat.take('attack'), true);
  now = .25; tick(); combat.poll(); assert.equal(combat.holdNow(), true); assert.equal(combat.holdNow(), false);
  input.release('MouseLeft'); tick(); combat.poll(); assert.equal(combat.holdNow(), false);
});
test('flow router menu open/close releases held movement and routes key-up', () => {
  const { input, router, tick } = setup(); const flow = createFlow({ input, player: { update() {} }, world: { update() {} } }, { save: { state: { settings: { mouseSensitivity: 1 } } } });
  let ups = 0; flow.onKeyUp(e => { if (e.code === 'ArrowUp') ups++; });
  flow.onKey(e => { if (e.code === 'Escape') { flow.setMode(flow.mode === 'play' ? 'menu' : 'play'); return true; } });
  input.press('F10'); tick(); assert.equal(flow.mode, 'menu'); assert.equal(router.isContextActive('gameplay'), false);
  tick(); input.press('KeyW'); tick(); input.release('KeyW'); tick(); assert.equal(ups, 1);
  input.press('F10'); tick(); assert.equal(flow.mode, 'play'); assert.equal(router.isContextActive('gameplay'), true);
});
test('custom controls do not collide or bind reserved native keys', () => {
  const { router } = setup(); assert.deepEqual(router.conflicts(), []);
  const reserved = ['KeyE', 'KeyT', 'KeyF', 'KeyG', 'KeyZ', 'KeyB', 'KeyQ', 'KeyX'];
  for (const a of router.actions().filter(a => a.context === 'gameplay' && a.name.startsWith('spider.'))) assert.equal(a.bindings.keys?.some(k => reserved.includes(k)) ?? false, false, a.name);
});

test('seated controls silence custom combat and retain native vehicle keys', () => {
  const { input, router, tick } = setup();
  router.registerAction('portable-vehicle.wipers', { kind: 'button', keys: ['KeyJ'] });
  input.setOnFoot(false); input.press('KeyJ'); input.press('MouseLeft'); tick();
  assert.equal(router.wasPressed('portable-vehicle.wipers'), true);
  assert.equal(input.poll().quick, false);
  const combat = createCombatInput(() => 0, () => 0, input); combat.enabled = true; combat.poll();
  assert.equal(combat.has('attack'), false);
  assert.deepEqual(router.conflicts(), []);
});

test('unarmed traversal keeps physical swing when native weapon actions are absent', () => {
  const router = new InputService({ getGamepads: () => [] });
  const input = createInput(null, { router, attach: false }); input.setOnFoot(true);
  router.mouseDown(2); router.update(1/60); assert.equal(input.poll().swingPressed, true);
  router.mouseUp(2); router.update(1/60);
  router.registerAction('secondary', {kind: 'button', mouseButtons: [2]}); input.updateMobile();
  assert.deepEqual(router.actions().find(a => a.name === 'spider.swing').bindings.mouseButtons, []);
  router.mouseDown(2); router.update(1/60); assert.equal(input.poll().swingPressed, true);
});
