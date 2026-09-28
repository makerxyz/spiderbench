// OWNER: systems engineer. Game-flow / time control without touching main.js' loop:
//   modes: 'play' | 'menu' | 'photo' | 'travel'.  Outside 'play' the player sim is frozen (player.update is
//   replaced by the active camera controller) and the world ticks with dt=0 (traffic/peds freeze, LOD still follows
//   the camera). Router contexts gate gameplay while a menu, native wheel or tablet is open. Also scales mouse look by settings (sensitivity / invert Y) at the input layer.
//   ctx.flow = { mode, setMode(m), isPlaying, onKey(fn), cameraHook }
import { MENU_ACTIONS } from '../../player/input.js';
import { emit } from './events.js';

export function createFlow(ctx, { save }) {
  const { player, world, input, hud } = ctx;
  let mode = 'play';
  let cameraHook = null; // fn(dt) run in place of player.update when not playing
  const keyHandlers = [], keyUpHandlers = [];
  const router = input.router;
  let flowContext = null;
  const heldKeys = new Set();

  const origPlayerUpdate = player.update;
  player.update = function (dt) {
    const wasFrozen = player.frozen;
    if (mode !== 'play') player.frozen = true;
    origPlayerUpdate.call(this, dt); // keep the native router, avatar and room alive in menus
    player.frozen = wasFrozen;
    if (mode !== 'play') cameraHook?.(dt);
  };
  const origWorldUpdate = world.update;
  world.update = function (dt, camera) { return origWorldUpdate.call(this, mode === 'play' ? dt : 0, camera); };

  // mouse sensitivity / invert-Y applied once, at the source (params.lookScaledByInput tells traversal not to re-apply)
  if (input?.poll) {
    const origPoll = input.poll;
    input.poll = function (...a) {
      const s = origPoll.apply(this, a);
      const st = save.state.settings;
      if (s?.look) { s.look.dx *= st.mouseSensitivity; s.look.dy *= st.mouseSensitivity * (st.invertY ? -1 : 1); }
      return s;
    };
  }

  function clearInput() {
    input.releaseAll();
    for (const code of heldKeys) for (const fn of keyUpHandlers) fn({ code });
    heldKeys.clear();
  }

  function setContext(context) {
    if (context === flowContext) return;
    if (flowContext) router.popContext(flowContext);
    flowContext = context;
    if (context) router.pushContext(context);
    clearInput();
  }

  function setMode(m) {
    if (m === mode) return;
    const prev = mode; mode = m;
    setContext(m === 'play' ? (overlay ? 'spider.dev' : null) : `spider.${m}`);
    if (m === 'play') cameraHook = null;
    hud?.setVisible?.(m === 'play');
    emit('flow:mode', { mode: m, prev });
  }

  // Existing UI callbacks receive router actions translated into their original key vocabulary.
  // A native wheel/tablet context automatically silences gameplay actions before they reach here.
  input.onFrame(() => {
    const heldNow = new Set(MENU_ACTIONS.filter(([name]) => router.isDown(`spider.${name}`)).map(([, code]) => code));
    for (const code of heldKeys) if (!heldNow.has(code)) for (const fn of keyUpHandlers) fn({ code });
    heldKeys.clear();
    // Snapshot before dispatch: opening a context must not expose that context's already-latched
    // version of the same key and immediately close the menu again.
    const pending = MENU_ACTIONS.filter(([name]) => router.wasPressed(`spider.${name}`));
    for (const [name, code] of pending) {
      if (!router.wasPressed(`spider.${name}`)) continue;
      const event = { code, repeat: false, preventDefault() {}, stopPropagation() {} };
      for (let i = keyHandlers.length - 1; i >= 0; i--) if (keyHandlers[i](event, mode) === true) break;
    }
    for (const [name, code] of MENU_ACTIONS) if (router.isDown(`spider.${name}`)) heldKeys.add(code);
  });
  // Overlay pointer gestures are UI input, not world buttons. Key input stays on the router.
  const root = document.getElementById('sys-root');
  for (const ev of ['mousedown', 'pointerdown', 'wheel', 'click', 'auxclick']) root?.addEventListener(ev, e => { if (mode !== 'play') e.stopPropagation(); });

  // losing pointer lock (browser eats the Esc keydown) while playing -> pause, like console games
  let hadLock = false, lockLostAt = 0, overlay = false; // overlay: a dev panel freed the cursor (no pause on lock loss)
  document.addEventListener('pointerlockchange', () => {
    const locked = !!document.pointerLockElement;
    if (!locked && hadLock && mode === 'play' && !overlay && router.isContextActive('gameplay')) { lockLostAt = performance.now(); emit('flow:lockLost'); }
    hadLock = locked;
  });

  return {
    get mode() { return mode; },
    get isPlaying() { return mode === 'play'; },
    get lockLostAt() { return lockLostAt; },
    setMode, clearInput,
    set overlay(v) { overlay = !!v; if (mode === 'play') setContext(overlay ? 'spider.dev' : null); }, get overlay() { return overlay; },
    setCameraHook(fn) { cameraHook = fn; },
    onKeyUp(fn) { keyUpHandlers.push(fn); return () => { const i = keyUpHandlers.indexOf(fn); if (i >= 0) keyUpHandlers.splice(i, 1); }; },
    onKey(fn) { keyHandlers.push(fn); return () => { const i = keyHandlers.indexOf(fn); if (i >= 0) keyHandlers.splice(i, 1); }; },
  };
}
