import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InputService } from '../public/helix_modules/humanoid-character/index.js';
import { createInput } from '../src/player/input.js';
import { createMobileInputView } from '../src/helix/mobile-input.js';

test('mobile gameplay layout keeps source context gating and restores native vehicle controls', () => {
  const router = new InputService({ getGamepads: () => [] });
  const input = createInput(null, { router, attach: false });
  router.registerAction('primary', { kind: 'button', context: 'gameplay', touch: 'hold' });
  input.setOnFoot(true);
  const view = createMobileInputView(router, () => input.onFoot);
  assert.equal(view.actions().find(a => a.name === 'spider.swing').context, 'gameplay');
  assert.equal(router.actions().find(a => a.name === 'spider.swing').context, 'spider.onfoot');
  view.setVirtualButton('spider.swing', true); router.update(1/60);
  assert.equal(input.poll().swing, true);
  router.pushContext('quick-slot'); router.update(1/60);
  assert.equal(input.poll().swing, false);
  input.setOnFoot(false);
  assert.equal(view.actions().some(a => a.name === 'spider.swing'), false);
  assert.equal(view.hasAction('primary'), true);
});

test('all custom touch abilities fit bounded native More pages', () => {
  const router = new InputService({ getGamepads: () => [] });
  createInput(null, { router, attach: false });
  const view = createMobileInputView(router, () => true), found = new Set();
  for (let i = 0; i < 4; i++) {
    const actions = view.actions().filter(a => a.context === 'gameplay');
    assert.ok(actions.filter(a => a.name !== 'spider.swing').length <= 8);
    for (const a of actions) found.add(a.name);
    assert.ok(actions.some(a => a.name === 'spider.mobilePage'));
    view.nextPage();
  }
  for (const action of router.actions().filter(a => a.context === 'spider.onfoot' && a.touch !== 'none')) assert.ok(found.has(action.name), action.name);
});
