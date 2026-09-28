# HELIX Spiderbench integration

Working branch: `feat/helix-universal-world`. This branch is kept pushed as implementation and verification advance.

Published world: https://new.helixgame.com/play/spiderbench

As of September 28, 2026, the active published revision is build 3 (`91c08342-3cca-46ea-95c6-36037b705577`), 49,777,150 bytes, within the existing 50 MiB limit. Source revision `d20b7be` is published. See [QA-2026-09-28.md](QA-2026-09-28.md) for the measured local and CDN paths and the remaining platform stability issue.

## Current working changes

- Universal Avatar, native camera/emotes, shared vehicle physics, unified platform input and touch controls are integrated.
- Asset preparation keeps the city and geometry while reducing the published bundle to about 47.47 MiB.
- Twenty-eight focused tests and the production build pass with the latest startup and mobile changes. Local nested-path browser testing rendered gameplay, animated the avatar, and moved it about 13 metres without audio request failures. Authenticated shell testing moved the equipped avatar 11.68 metres with a stable room during that measurement.
- Hosted testing confirmed the signed-in Universal Avatar and a joined multiplayer room, but exposed a startup reload: the shell starts a room deadline while the large city is still building.
- The published source creates the native player and requires a managed room before building the city, then attaches city collision/traversal. Authenticated shell testing confirms room admission before city generation, the equipped avatar, rendered gameplay, and no input conflicts.
- Fresh authenticated shell testing on September 28 confirmed one stable room through startup and 35 seconds of play, 16 metres of keyboard movement, an active swing, quick-slot vehicle placement and resolution, driver-seat entry, about 68 metres of measured driving, a clear exit, an active emote, and an avatar change restored to the original Base Male. A short wait for the native quick-slot reply before synchronous city construction prevents the initial ring read from timing out; a fresh load showed all eight petals without a synthetic refresh.
- The prior build 2 started city generation before room admission. In authenticated CDN testing it hit the 12-second no-room retry and its iframe detached, then restarted the same build. Build 3 reached a joined room before city generation and held one iframe for 35 seconds. Later in the same session the shell cleared its room report and remounted the iframe twice, with `524` reconnect responses. A separate platform owner is addressing that automatic restart policy.
- A second build 3 session lost room state at about 28 seconds and restarted too. The `524` reconnect responses occur after remount and do not explain the first room loss. Authenticated native Windows Chrome on VRPC remained on the loading screen through 40 seconds and repeatedly navigated the build 3 iframe, without an observed browser crash or WebGL context loss. See the dated QA receipt for precise limits.
- Native HELIX OS camera shutter produced a full, fetchable JPEG of the rendered city (see the dated QA receipt). The world now has a custom thumbnail from tracked mid-swing loading art; the CDN image responds 200, active build 3 and Teen rating unchanged.
- The original room-loss edge is not yet explained by browser evidence. The shell's missing-room watchdog remounts the iframe after the null report; the matching HELIX frontend owner is removing that automatic restart policy. Later reconnect `524` responses follow remount. A valid room and roster were reported before the longer session lost room state.
- Mobile emulation passed at 390x844 and 844x390: one native controller, touch movement over eight metres, all four bounded More pages, and a real touch hold activating a research tower. World activities now offer the native Interact button and yield to nearby vehicle seats. The controller's action metadata view keeps gameplay actions out of the native modal row while preserving the actual router's context gating.

## Remaining acceptance

Verify stable play after the platform restart-policy fix, representative bridge driving, and the Windows first-frame failure with further native Windows evidence. Land the working branch. Physical-phone acceptance has not been performed.

## Reproduction and publishing

See README.md for installation, build, tests and browser checks. The generated `public/helix_modules/` directory requires `helix install`; it is intentionally ignored by git. Source assets are tracked; optimized assets and build output are regenerated.

Use the helix3 API and website environment values shown in README.md for CLI operations. The CLI currently times out after 30 seconds on finalize for this bundle even when the server subsequently publishes successfully. Reconcile the live world/build status before retrying; another publish creates another build.

`qa/browser.mjs` tests a nested local URL. `qa/hosted-repl.mjs` uses existing local creator credentials for authentic headless HELIX acceptance. Its optional `--local` flag substitutes the local `dist` files inside the real authenticated shell for iteration; final published acceptance runs without that flag. Credentials are never committed. Task evidence is written under ignored `qa/evidence/`.

Another agent may read or branch from the synced source. Coordinate file ownership before writing to this working branch; the active delivery owner is still implementing and testing the startup path.
