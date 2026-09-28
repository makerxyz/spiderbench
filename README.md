# Spiderbench — a browser web-swinging game written by Claude

A non-commercial fan project and benchmark. It shows the kind of code and assets that **Claude** (Anthropic's AI model, working through Claude Code) can produce for a real-time 3D game running in the browser.

The code, shaders, procedural city, Blender-built models and generated textures were produced by Claude under the direction of a human, who steered the work through feedback and reference images.

## What's in it
- **Traversal:** third-person web-swinging, wall-running, perching, zipping and diving, driven by a custom physics and animation state machine.
- **City:** a procedural Manhattan-style island with an authored street network, including Broadway, Greenwich Village and the Financial District. It has thousands of buildings, rooftops, parks, Times Square, bridges, traffic and pedestrians.
- **Rendering:** a Three.js (WebGL2) pipeline with cascaded shadows, screen-space GI, AO and reflections, bloom, TAA, motion blur, fixed time-of-day presets (including night and rain), and a day/night city.
- **Assets:** character, vehicle and pedestrian models and animation clips built by Blender Python scripts, plus AI-generated textures and ad art. Advertised brands are invented, apart from in-universe Marvel names such as the Daily Bugle and Oscorp.

## HELIX world

This integration uses your equipped Universal Avatar, the native HELIX camera and emotes, and portable Universal Vehicles. The original city, traversal, missions and rendering remain in the world. Vehicle physics shares the actual roads, bridges and streamed building geometry with the character.

One HELIX InputService drives desktop, gamepad and the platform touch controller. Swing is the primary touch action; Jump, Zip and additional actions use the native controls and More tray. Desktop: WASD moves, right mouse swings, R/middle mouse zips, Space jumps, G opens quick slots, E interacts, and F10 pauses. HELIX OS keeps its platform shortcut. The Avatar tab explains how to change your equipped avatar through HELIX OS.

The production build prepares compressed geometry and WebP textures in `public-optimized/`; source assets remain unchanged. It fits the existing 50 MiB publication limit. Low is the portable default graphics preset; Medium and High remain available in Settings.

From a fresh clone, install both JavaScript dependencies and the generated HELIX modules before building or testing. The runtime descriptor and import map use compatible hosted platform resolvers.

```bash
npm ci
HELIX_API_URL=https://helix-backend-api-helix3.up.railway.app \
HELIX_WEB_URL=https://new.helixgame.com \
npx --yes @helix3/helix-cli install
npm run build
npm test
npx playwright install chromium
node qa/browser.mjs
```

The browser check serves the built world at a nested path and verifies rendered readiness and movement with headless Chromium. `qa/hosted-repl.mjs <play URL>` is an authenticated acceptance console using the creator CLI's existing credentials; it keeps credentials in memory and recalls only the test vehicle it spawned.

## Run it
Requires Node.js 20.19+ or 22.12+ and a WebGL2-capable browser. A discrete GPU is recommended.

```bash
npm install
npm run dev      # then open http://127.0.0.1:5173
npm run build    # production build in dist/
```

Controls are listed in-game (press **H**). On the dev server, **F8** opens a developer menu (on a build, add `?dev` to the URL).

## Disclaimer
This is an unofficial fan project, made only as a technical demonstration. It is not affiliated with, endorsed by or sponsored by Marvel, Disney, Sony or Insomniac Games. Spider-Man and related names, characters and likenesses are trademarks and copyrighted material of their respective owners, and no rights to them are claimed. **This project is not for sale and may not be redistributed or used commercially.** See [LICENSE](LICENSE).

Bundled fonts are under the SIL Open Font License; see `public/assets/ui/fonts/`.
