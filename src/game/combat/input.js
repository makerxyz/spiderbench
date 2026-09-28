// Buffered combat actions read the same platform snapshot as traversal and native abilities.
// LMB / LT attack (hold: launcher), C / B dodge, U web, K strike, O throw, L finisher, ; heal.
const HOLD = 0.22, BUFFER = 0.45;
export function createCombatInput(realClock, gameClock, input) {
  const router = input?.router ?? input;
  if (!router) throw new Error('Combat requires the shared world InputService');
  const rnow = realClock || (() => performance.now() / 1000);
  const gnow = gameClock || rnow;
  const pressed = new Map();
  let enabled = false, attackDown = false, pressT = 0, holdSent = true;
  const actions = { attack: 'attack', dodge: 'drop', web: 'web', strike: 'strike', throw: 'throw', finisher: 'finisher', heal: 'heal' };
  return {
    set enabled(v) { enabled = !!v; if (!enabled) { pressed.clear(); attackDown = false; holdSent = true; } },
    get enabled() { return enabled; },
    poll() {
      if (!enabled || input.onFoot === false) { pressed.clear(); attackDown = false; holdSent = true; return; }
      const anchoring = input?.sling?.gate && router.isDown('spider.slingshot');
      for (const [action, id] of Object.entries(actions)) {
        if (action === 'attack' && anchoring) continue;
        if ((input.edge?.(`spider.${id}`) ?? router.wasPressed(`spider.${id}`))) {
          pressed.set(action, gnow());
          if (action === 'attack') { pressT = rnow(); holdSent = false; }
        }
      }
      attackDown = !anchoring && (input.down?.('spider.attack') ?? router.isDown('spider.attack'));
      if (!attackDown) holdSent = true;
      if (!router.isContextActive('gameplay')) { pressed.clear(); holdSent = true; }
    },
    has(k) { const t = pressed.get(k); if (t == null) return false; if (gnow() - t > BUFFER) { pressed.delete(k); return false; } return true; },
    take(k) { const ok = this.has(k); pressed.delete(k); return ok; },
    holdNow() { if (!holdSent && attackDown && rnow() - pressT >= HOLD) { holdSent = true; return true; } return false; },
    clear() { pressed.clear(); },
  };
}
