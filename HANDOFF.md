# HELIX Spiderbench integration

Working branch: `feat/helix-universal-world`. This branch is kept pushed as implementation and verification advance.

Published world: https://new.helixgame.com/play/spiderbench

As of September 27, 2026, the active published revision is build 2 (`4b431132-542e-4fdd-9e7e-01a43dcaa0b4`), 49,774,825 bytes, within the existing 50 MiB limit. Publication is confirmed; full hosted acceptance is still in progress.

## Current working changes

- Universal Avatar, native camera/emotes, shared vehicle physics, unified platform input and touch controls are integrated.
- Asset preparation keeps the city and geometry while reducing the published bundle to about 47.47 MiB.
- Twenty-eight focused tests and the production build pass with the latest startup and mobile changes. Local nested-path browser testing rendered gameplay, animated the avatar, and moved it about 13 metres without audio request failures. Authenticated shell testing moved the equipped avatar 11.68 metres with a stable room during that measurement.
- Hosted testing confirmed the signed-in Universal Avatar and a joined multiplayer room, but exposed a startup reload: the shell starts a room deadline while the large city is still building.
- The latest working change creates the native player and requires a managed room before building the city, then attaches city collision/traversal. Authenticated shell testing with the local build confirms room admission before city generation, the equipped avatar, rendered gameplay, and no input conflicts. These source changes still need publication.
- Fresh authenticated shell testing on September 28 confirmed one stable room through startup and 35 seconds of play, 16 metres of keyboard movement, an active swing, quick-slot vehicle placement and resolution, driver-seat entry, about 68 metres of measured driving, a clear exit, an active emote, and an avatar change restored to the original Base Male. A short wait for the native quick-slot reply before synchronous city construction prevents the initial ring read from timing out; a fresh load showed all eight petals without a synthetic refresh.
- The still-published build 2 starts city generation before room admission. In authenticated CDN testing it hit the 12-second no-room retry and its iframe detached, then restarted the same build. The separate HELIX shell lifecycle fix was merged to `helix3`; a platform owner is now addressing the broader automatic restart policy. The world source fix must still be published and tested from its CDN bytes.
- The shell still remounts the iframe after clearing its room state during an unrelated effect teardown. The iframe URL and microphone epoch stay unchanged while the parent rejoin epoch increments; a valid room and roster were reported before the watchdog fires. A separate frontend owner is fixing that lifecycle issue on HELIX's integration branch. It is not a world asset-size or avatar-join failure.
- Mobile emulation passed at 390x844 and 844x390: one native controller, touch movement over eight metres, all four bounded More pages, and a real touch hold activating a research tower. World activities now offer the native Interact button and yield to nearby vehicle seats. The controller's action metadata view keeps gameplay actions out of the native modal row while preserving the actual router's context gating.

## Remaining acceptance

Verify stable startup from published CDN bytes, representative road and bridge driving, HELIX OS camera capture, and any Windows-specific browser failure with actual Windows evidence. Publish the verified revision, capture a clean world thumbnail, and land the working branch. Physical-phone acceptance has not been performed.

## Reproduction and publishing

See README.md for installation, build, tests and browser checks. The generated `public/helix_modules/` directory requires `helix install`; it is intentionally ignored by git. Source assets are tracked; optimized assets and build output are regenerated.

Use the helix3 API and website environment values shown in README.md for CLI operations. The CLI currently times out after 30 seconds on finalize for this bundle even when the server subsequently publishes successfully. Reconcile the live world/build status before retrying; another publish creates another build.

`qa/browser.mjs` tests a nested local URL. `qa/hosted-repl.mjs` uses existing local creator credentials for authentic headless HELIX acceptance. Its optional `--local` flag substitutes the local `dist` files inside the real authenticated shell for iteration; final published acceptance runs without that flag. Credentials are never committed. Task evidence is written under ignored `qa/evidence/`.

Another agent may read or branch from the synced source. Coordinate file ownership before writing to this working branch; the active delivery owner is still implementing and testing the startup path.
