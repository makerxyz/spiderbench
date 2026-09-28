// Layout metadata for the native controller. All reads and virtual writes still
// use the one canonical router; this view never pumps input or changes bindings.
const PAGES = [
  ['emote', 'spider.zip', 'cameraMode', 'spider.map', 'spider.menu', 'weapon', 'addons'],
  ['spider.zip', 'spider.quick', 'spider.rope', 'spider.drop', 'spider.slingshot', 'spider.slingLeft', 'spider.slingRight'],
  ['spider.attack', 'spider.web', 'spider.strike', 'spider.throw', 'spider.finisher', 'spider.heal', 'spider.photo'],
  ['emote', 'cameraMode', 'point', 'voicePTT', 'xray', 'vehicles', 'addons'],
];
const NEXT_LABEL = ['Traversal', 'Combat', 'Platform', 'Back'];
const CORE = new Set(['move', 'look', 'zoom', 'jump', 'interact']);

export function createMobileInputView(router, isOnFoot) {
  let page = 0;
  return {
    nextPage() { page = (page + 1) % PAGES.length; },
    resetPage() { page = 0; },
    actions() {
      const onFoot = isOnFoot(), shown = new Set(PAGES[page]);
      return router.actions().flatMap(action => {
        if (CORE.has(action.name)) return [action];
        if (!onFoot) return action.context === 'spider.onfoot' || action.name === 'spider.mobilePage' ? [] : [action];
        if (action.context !== 'gameplay' && action.context !== 'spider.onfoot') return [action];
        if (action.name === 'spider.mobilePage') return [{ ...action, label: NEXT_LABEL[page] }];
        if (action.name === 'spider.swing' || shown.has(action.name)) {
          // spider.onfoot is a gameplay layer, not a modal menu. The native HUD
          // lays out non-gameplay contexts as a single row of modal verbs.
          return [{ ...action, context: 'gameplay' }];
        }
        return [];
      });
    },
    hasAction(name) { return name === 'primary' && isOnFoot() ? false : router.hasAction(name); },
    isContextActive: name => router.isContextActive(name),
    isToggled: name => router.isToggled(name),
    pointerDelta: (x, y) => router.pointerDelta(x, y),
    setVirtualButton: (name, value) => router.setVirtualButton(name, value),
    setVirtualVec2: (name, value) => router.setVirtualVec2(name, value),
    setVirtualDelta: (name, value) => router.setVirtualDelta(name, value),
  };
}
