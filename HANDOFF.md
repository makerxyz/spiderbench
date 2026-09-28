# HELIX Spiderbench integration

Working branch: `feat/helix-universal-world`. This branch is kept pushed as implementation and verification advance.

Published world: https://new.helixgame.com/play/spiderbench

As of September 27, 2026, the active published revision is build 2 (`4b431132-542e-4fdd-9e7e-01a43dcaa0b4`), 49,774,825 bytes, within the existing 50 MiB limit. Publication is confirmed; full hosted acceptance is still in progress.

## Current working changes

- Universal Avatar, native camera/emotes, shared vehicle physics, unified platform input and touch controls are integrated.
- Asset preparation keeps the city and geometry while reducing the published bundle to about 47.47 MiB.
- Twenty-six focused tests and the production build pass with the latest startup adjustment. Local nested-path browser testing rendered gameplay, animated the avatar, and moved it about 13 metres without audio request failures.
- Hosted testing confirmed the signed-in Universal Avatar and a joined multiplayer room, but exposed a startup reload: the shell starts a room deadline while the large city is still building.
- The latest working change creates the native player and requires a managed room before building the city, then attaches city collision/traversal. Authenticated shell testing with the local build confirms room admission before city generation, the equipped avatar, rendered gameplay, and no input conflicts. These source changes still need publication.
- The shell still remounts the iframe after clearing its room state during an unrelated effect teardown. The iframe URL and microphone epoch stay unchanged while the parent rejoin epoch increments; a valid room and roster were reported before the watchdog fires. A separate frontend owner is fixing that lifecycle issue on HELIX's integration branch. It is not a world asset-size or avatar-join failure.

## Remaining acceptance

Verify stable startup without iframe remounts, movement and swinging, avatar changes, vehicle spawn/enter/drive/exit across representative roads and bridges, HELIX OS camera capture, emotes, and portrait/landscape touch controls. Publish the verified revision, capture a clean world thumbnail, and land the working branch. Physical-phone acceptance has not been performed.

## Reproduction and publishing

See README.md for installation, build, tests and browser checks. The generated `public/helix_modules/` directory requires `helix install`; it is intentionally ignored by git. Source assets are tracked; optimized assets and build output are regenerated.

Use the helix3 API and website environment values shown in README.md for CLI operations. The CLI currently times out after 30 seconds on finalize for this bundle even when the server subsequently publishes successfully. Reconcile the live world/build status before retrying; another publish creates another build.

`qa/browser.mjs` tests a nested local URL. `qa/hosted-repl.mjs` uses existing local creator credentials for authentic headless HELIX acceptance. Its optional `--local` flag substitutes the local `dist` files inside the real authenticated shell for iteration; final published acceptance runs without that flag. Credentials are never committed. Task evidence is written under ignored `qa/evidence/`.

Another agent may read or branch from the synced source. Coordinate file ownership before writing to this working branch; the active delivery owner is still implementing and testing the startup path.
