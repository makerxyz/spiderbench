// One platform router owns keyboard, mouse, gamepad, automation and generated touch controls.
// CharacterMultiplayer pumps it once per frame. poll() only adapts that snapshot to traversal.
import { InputService, createMobileControls } from '@helix/humanoid-character';
import { createMobileInputView } from '../helix/mobile-input.js';

export const SPIDER_ACTIONS = {
  swing: { label: 'Swing', touch: 'hold' },
  zip: { mouseButtons: [1], label: 'Zip', touch: 'button' },
  quick: { keys: ['KeyJ'], label: 'Web boost', touch: 'button' },
  rope: { keys: ['KeyY'], label: 'Tightrope', touch: 'button' },
  drop: { keys: ['KeyC'], gamepadButtons: [1], label: 'Drop / dodge', touch: 'hold' },
  slingshot: { keys: ['ControlLeft', 'ControlRight'], label: 'Slingshot stance', touch: 'hold' },
  slingLeft: { label: 'Left anchor', touch: 'button' },
  slingRight: { label: 'Right anchor', touch: 'button' },
  attack: { label: 'Attack', touch: 'button' },
  web: { keys: ['KeyU'], label: 'Web shooter', touch: 'button' },
  strike: { keys: ['KeyK'], label: 'Web strike', touch: 'button' },
  throw: { keys: ['KeyO'], label: 'Throw', touch: 'button' },
  finisher: { keys: ['KeyL'], label: 'Finisher', touch: 'button' },
  heal: { keys: ['Semicolon'], label: 'Heal', touch: 'button' },
  help: { keys: ['KeyH'], label: 'Help', touch: 'none' },
};

// Existing menus retain their key-oriented callbacks; these are semantic router actions,
// including controller and touch bindings, translated at the UI boundary (never DOM events).
export const MENU_ACTIONS = [
  ['menu', 'Escape', ['F10'], 'gameplay', [9], 'Pause', 'button'],
  ['map', 'KeyM', ['KeyM'], 'gameplay', [8], 'Map', 'button'],
  ['photo', 'KeyV', ['F6'], 'gameplay', [], 'Photo', 'button'],
  ['dev', 'Backquote', ['F8'], 'gameplay', [], 'Developer', 'none'],
  ['menu.close', 'Escape', ['F10', 'Backspace'], 'spider.menu', [9, 1], 'Resume', 'button'],
  ['menu.map', 'KeyM', ['KeyM'], 'spider.menu', [8], 'Map', 'none'],
  ['menu.previous', 'KeyQ', ['KeyQ'], 'spider.menu', [4], 'Previous tab', 'button'],
  ['menu.next', 'KeyE', ['KeyE'], 'spider.menu', [5], 'Next tab', 'button'],
  ['menu.confirm', 'Enter', ['Enter', 'NumpadEnter', 'Space'], 'spider.menu', [0], 'Select', 'button'],
  ['menu.up', 'ArrowUp', ['ArrowUp', 'KeyW'], 'spider.menu', [12], 'Up', 'none'],
  ['menu.down', 'ArrowDown', ['ArrowDown', 'KeyS'], 'spider.menu', [13], 'Down', 'none'],
  ['menu.left', 'ArrowLeft', ['ArrowLeft', 'KeyA'], 'spider.menu', [14], 'Left', 'none'],
  ['menu.right', 'ArrowRight', ['ArrowRight', 'KeyD'], 'spider.menu', [15], 'Right', 'none'],
  ['menu.zoomIn', 'Equal', ['Equal', 'NumpadAdd'], 'spider.menu', [], 'Zoom in', 'button'],
  ['menu.zoomOut', 'Minus', ['Minus', 'NumpadSubtract'], 'spider.menu', [], 'Zoom out', 'button'],
  ['menu.center', 'KeyC', ['KeyC'], 'spider.menu', [], 'Center map', 'button'],
  ['dev.close', 'Escape', ['F8', 'Backspace'], 'spider.dev', [], 'Close developer', 'button'],
  ...['Escape', 'Enter', 'KeyH', 'KeyR', 'KeyQ', 'KeyE', 'Delete', 'Backspace', 'KeyG', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'ShiftLeft', 'ShiftRight'].map(code => [
    `photo.${code}`, code, code === 'Escape' ? ['KeyP'] : code === 'Enter' ? ['Enter', 'NumpadEnter'] : [code], 'spider.photo', [], code === 'Escape' ? 'Exit photo' : code === 'Enter' ? 'Capture' : code, ['Escape', 'Enter'].includes(code) ? 'button' : 'none',
  ]),
];

export function createInput(el, { router = new InputService(), attach = true } = {}) {
  for (const [name, def] of Object.entries(SPIDER_ACTIONS)) router.registerAction(`spider.${name}`, { kind: 'button', context: 'spider.onfoot', ...def }, 'spiderbench');
  for (const [name, , keys, context, gamepadButtons, label, touch] of MENU_ACTIONS) {
    router.registerAction(`spider.${name}`, { kind: 'button', keys, context, gamepadButtons, label, touch }, 'spiderbench');
  }
  router.registerAction('spider.mobilePage', { kind: 'button', context: 'gameplay', label: 'Traversal', touch: 'button' }, 'spiderbench');
  if (attach) {
    router.attach(window);
    // Platform mobile controls capture touch gestures before this bubble listener, so desktop
    // unlocked drag and pointer lock work without delivering touch look twice.
    router.attachPointer(el, document, { dragLook: true });
  }
  let mobile = null, onFoot = true;
  const mobileInput = createMobileInputView(router, () => onFoot);
  const aliases = { 'spider.swing': 'secondary', 'spider.attack': 'primary', 'spider.zip': 'reload' };
  const fallbackBindings = {
    'spider.swing': { mouseButtons: [2], gamepadButtons: [6] },
    'spider.attack': { mouseButtons: [0], gamepadButtons: [7] },
    'spider.zip': { keys: ['KeyR'], gamepadButtons: [3] },
  };
  const nativeAvailable = new Map();
  function syncBindings() {
    for (const [custom, native] of Object.entries(aliases)) {
      const available = router.hasAction(native);
      if (nativeAvailable.get(custom) === available) continue;
      nativeAvailable.set(custom, available);
      router.rebind(custom, Object.fromEntries(Object.entries(fallbackBindings[custom]).map(([key, value]) => [key, available ? [] : value])));
    }
  }
  syncBindings();
  const directDown = name => router.hasAction(name) && router.isDown(name);
  const directEdge = name => router.hasAction(name) && router.wasPressed(name);
  const alias = name => onFoot && router.isContextActive('spider.onfoot') ? aliases[name] : null;
  const frameHandlers = new Set();
  const down = name => directDown(name) || !!(alias(name) && directDown(alias(name)));
  const edge = name => directEdge(name) || !!(alias(name) && directEdge(alias(name)));
  const sampled = name => down(name) || edge(name);
  const sling = { gate: false };
  const state = { move: { x: 0, y: 0 }, look: { dx: 0, dy: 0 }, jumpHeld: 0, aimT: 99 };
  const prev = {};
  const mouseCodes = { MouseLeft: 0, MouseMiddle: 1, MouseRight: 2 };
  const press = code => code in mouseCodes ? router.mouseDown(mouseCodes[code]) : router.keyDown(code);
  const release = code => code in mouseCodes ? router.mouseUp(mouseCodes[code]) : router.keyUp(code);
  function releaseAll() {
    router.releaseAll();
    for (const action of router.actions()) {
      if (action.kind === 'button' || action.kind === 'toggle') router.setVirtualButton(action.name, null);
      else if (action.kind === 'vec2') router.setVirtualVec2(action.name, null);
      else if (action.kind === 'delta') router.setVirtualDelta(action.name, null);
    }
    for (const name of Object.keys(prev)) prev[name] = false;
  }
  // Compatibility for callers that used the old key Set. State comes from the router,
  // including context gating and rebinding; no independent physical-key cache exists.
  const keys = {
    has(code) {
      return router.actions().some(a => down(a.name) && a.bindings.keys?.includes(code));
    },
    add: press, delete: release, clear: releaseAll,
  };
  const mouse = {
    get buttons() { return (down('spider.attack') ? 1 : 0) | (down('spider.zip') ? 2 : 0) | (down('spider.swing') ? 4 : 0); },
    set buttons(value) { if (!value) for (const button of [0, 1, 2]) router.mouseUp(button); },
  };
  function poll(dt = 1 / 60) {
    const move = router.hasAction('move') ? router.vec2('move') : { x: 0, y: 0 };
    const look = router.lookDelta();
    const stick = router.hasAction('look') ? router.vec2('look') : { x: 0, y: 0 };
    const ctrl = down('spider.slingshot');
    const anchoring = ctrl && sling.gate;
    Object.assign(state, {
      move: { ...move }, look: { dx: look.x + stick.x * 900 * dt, dy: look.y - stick.y * 600 * dt },
      usingPad: router.activeDevice() === 'gamepad',
      swing: sampled('spider.swing') && !anchoring, jump: sampled('jump'), zip: sampled('spider.zip'),
      sprint: sampled('sprint'), walk: false, drop: sampled('spider.drop'), quick: sampled('spider.quick'), rope: sampled('spider.rope'), ctrl,
      slingL: sling.gate && (edge('spider.slingLeft') || (anchoring && edge('spider.attack'))),
      slingR: sling.gate && (edge('spider.slingRight') || (anchoring && edge('spider.swing'))),
    });
    for (const name of ['swing', 'jump', 'zip', 'drop', 'sprint', 'walk', 'quick', 'rope']) {
      const id = ['jump', 'sprint'].includes(name) ? name : `spider.${name}`;
      state[`${name}Pressed`] = state[name] && (edge(id) || !prev[name]);
      state[`${name}Released`] = !state[name] && !!prev[name];
      prev[name] = state[name];
    }
    state.jumpHeld = state.jump ? state.jumpHeld + dt : 0;
    state.aimT = Math.abs(state.look.dx) + Math.abs(state.look.dy) > 1.5 ? 0 : state.aimT + dt;
    return state;
  }
  return {
    router, keys, mouse, sling, state, poll, press, release, releaseAll, down, edge,
    get onFoot() { return onFoot; },
    hint(name, device) { return router.hint(aliases[name] && router.hasAction(aliases[name]) ? aliases[name] : name, device); },
    setOnFoot(value) {
      if (onFoot !== value) { mobileInput.resetPage(); }
      onFoot = value;
      const contexts = router.activeContexts();
      if (contexts.every(c => c === 'gameplay' || c === 'spider.onfoot')) {
        const wanted = value ? ['gameplay', 'spider.onfoot'] : ['gameplay'];
        if (contexts.join() !== wanted.join()) router.setContexts(wanted);
      }
    },
    get mobile() { return mobile; },
    refreshBindings() {
      syncBindings();
      if (router.hasAction('walk')) router.rebind('walk', { keys: ['AltLeft'] });
      if (router.hasAction('crouch')) router.rebind('crouch', { keys: [], gamepadButtons: [] });
      mobile?.refresh();
    },
    mountMobile(options = {}) {
      this.setOnFoot(true);
      this.refreshBindings();
      mobile?.destroy();
      mobile = createMobileControls(mobileInput, {
        surface: el,
        actions: [
          { id: 'jump', order: 0 }, { id: 'spider.swing', order: 1, placement: 'primary' }, { id: 'spider.zip', order: 2 },
          { id: 'spider.mobilePage', order: 99 },
          { id: 'emote', label: 'Quick slots' },
          ...['menu', 'map', 'photo'].map(id => ({ id: `spider.${id}`, placement: 'utility' })),
          { id: 'crouch', visible: false },
        ],
        theme: { accent: '#e63e49' }, ...options,
      });
      return mobile;
    },
    updateMobile() { syncBindings(); mobile?.update(); },
    // Call after mp.update(); read-only consumers share exactly that frame's edges.
    updateUI(dt) {
      if (router.wasPressed('spider.mobilePage')) { mobileInput.nextPage(); mobile?.refresh(); }
      for (const fn of frameHandlers) fn(dt);
    },
    onFrame(fn) { frameHandlers.add(fn); return () => frameHandlers.delete(fn); },
    dispose() { mobile?.destroy(); mobile = null; frameHandlers.clear(); router.dispose(); },
  };
}
