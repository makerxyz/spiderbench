// OWNER: traversal engineer. Touch controls for mobile / coarse-pointer devices.
// Virtual joystick (left 45% of screen) -> move {x,y}; drag anywhere else on the
// canvas -> camera look; on-screen buttons -> swing / jump / zip / drop / quick / walk.
// Merged into the input state by player/input.js poll(). Enable with ?touch=1,
// disable with ?touch=0; otherwise auto-enabled on coarse pointers.
export function createTouch(el) {
  const params = new URLSearchParams(location.search);
  const force = params.get('touch');
  const coarse = (window.matchMedia?.('(pointer: coarse)').matches) || ('ontouchstart' in window && !matchMedia('(pointer: fine)').matches);
  const enabled = force === '1' ? true : force === '0' ? false : coarse;

  const state = { moveX: 0, moveY: 0 };
  const held = { swing: false, jump: false, zip: false, drop: false, quick: false, walk: false };
  const tapped = new Set();
  let lookDX = 0, lookDY = 0;
  const api = { enabled, state, held, tapped, consumeLook() { const r = { dx: lookDX, dy: lookDY }; lookDX = lookDY = 0; return r; } };
  if (!enabled) return api;

  // stop pinch-zoom / double-tap zoom / scroll gestures from hijacking the game
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) meta.setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
  for (const t of [document.documentElement, document.body, el]) t.style.touchAction = 'none';
  document.addEventListener('gesturestart', e => e.preventDefault());

  const css = `
  #touchui{position:fixed;inset:0;z-index:900;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;font-family:'Spiderbench Sans',Manrope,system-ui,sans-serif}
  #joy{position:absolute;width:124px;height:124px;margin:-62px 0 0 -62px;border-radius:50%;border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.06);display:none}
  #joyknob{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(255,255,255,.45)}
  #tbtns button{position:absolute;pointer-events:auto;border-radius:50%;border:2px solid rgba(255,255,255,.4);background:rgba(10,12,20,.45);color:#fff;font-weight:800;letter-spacing:.06em;touch-action:none}
  #tbtns button.on{background:rgba(227,38,47,.75);border-color:#fff}
  #b-swing{right:18px;bottom:118px;width:92px;height:92px;font-size:13px}
  #b-jump{right:126px;bottom:34px;width:74px;height:74px;font-size:12px}
  #b-zip{right:134px;bottom:134px;width:64px;height:64px;font-size:11px}
  #b-drop{right:28px;bottom:226px;width:64px;height:64px;font-size:11px}
  #b-quick{right:118px;bottom:222px;width:60px;height:60px;font-size:10px}
  #b-walk{right:206px;bottom:96px;width:56px;height:56px;font-size:9px}
  #thint{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);color:rgba(255,255,255,.75);font-size:12px;letter-spacing:.08em;background:rgba(0,0,0,.45);padding:8px 14px;border-radius:20px;transition:opacity 1.2s;white-space:nowrap}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const ui = document.createElement('div');
  ui.id = 'touchui';
  ui.innerHTML = `<div id="joy"><div id="joyknob"></div></div>
    <div id="tbtns">
      <button id="b-swing" data-a="swing">SWING</button>
      <button id="b-jump" data-a="jump">JUMP</button>
      <button id="b-zip" data-a="zip">ZIP</button>
      <button id="b-drop" data-a="drop">DROP</button>
      <button id="b-quick" data-a="quick">BOOST</button>
      <button id="b-walk" data-a="walk">PARKOUR</button>
    </div>
    <div id="thint">LEFT THUMB move &nbsp;·&nbsp; RIGHT THUMB camera &nbsp;·&nbsp; HOLD SWING in air</div>`;
  document.body.appendChild(ui);
  setTimeout(() => { const h = ui.querySelector('#thint'); if (h) h.style.opacity = '0'; }, 7000);

  const joyEl = ui.querySelector('#joy'), knob = ui.querySelector('#joyknob');
  const R = 62, SENS = 2.4;
  const joy = { id: null, ox: 0, oy: 0 };
  const cam = { id: null, lx: 0, ly: 0 };

  el.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && joy.id === null) {
        joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY;
        joyEl.style.display = 'block'; joyEl.style.left = t.clientX + 'px'; joyEl.style.top = t.clientY + 'px';
        knob.style.transform = 'translate(0px,0px)';
      } else if (cam.id === null) {
        cam.id = t.identifier; cam.lx = t.clientX; cam.ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  el.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) {
        let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
        const len = Math.hypot(dx, dy);
        if (len > R) { dx = dx / len * R; dy = dy / len * R; }
        state.moveX = dx / R; state.moveY = -dy / R;
        knob.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (t.identifier === cam.id) {
        lookDX += (t.clientX - cam.lx) * SENS; lookDY += (t.clientY - cam.ly) * SENS;
        cam.lx = t.clientX; cam.ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const endTouch = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { joy.id = null; state.moveX = state.moveY = 0; joyEl.style.display = 'none'; }
      if (t.identifier === cam.id) cam.id = null;
    }
  };
  el.addEventListener('touchend', endTouch);
  el.addEventListener('touchcancel', endTouch);

  ui.querySelectorAll('#tbtns button').forEach(b => {
    const a = b.dataset.a;
    b.addEventListener('touchstart', e => { held[a] = true; tapped.add(a); b.classList.add('on'); e.preventDefault(); e.stopPropagation(); }, { passive: false });
    const off = e => { held[a] = false; b.classList.remove('on'); };
    b.addEventListener('touchend', off);
    b.addEventListener('touchcancel', off);
  });

  return api;
}
