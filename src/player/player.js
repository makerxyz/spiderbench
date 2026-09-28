import * as THREE from 'three';
import { Helix, VehicleSpecialtyRoomTransport, vehicleSpecialtyPlacementBinding } from '@hypersoniclabs/helix-sdk';
import { CharacterMultiplayer, LocomotionAbility, RapierBody, SharedPhysicsWorld, VehicleScene, PortableVehiclePresentationRuntime } from '@helix/humanoid-character';
import { world as inspector } from '@helix/engine-core/inspect';
import { screenshots } from '@helix/engine-core/screenshot';
import { SYSTEM_ASSET_BASE, TRANSCODER_PATH } from '../helix.runtime';
import { installCityPhysics } from '../helix/city-physics.js';
import { createUniversalRig, POSES } from './rig.js';
import { createWebSystem } from './web.js';
import { createSlingWebs } from './slingweb.js';
import { createRopeWebs } from './ropeweb.js';
import { createChaseCamera } from './camera.js';
import { createTraversal, H } from './traversal/traversal.js';

const read = (bb, key) => { try { return bb.get(key); } catch { return false; } };

export async function createPlayer({ scene, world, camera, input, renderer }) {
  const spawn = { x: world.spawn.x, y: world.spawn.y + 0.1, z: world.spawn.z };
  const shared = await SharedPhysicsWorld.create(-9.81, { stepMode: 'fixed', fixedHz: 60 });
  const body = await RapierBody.create({ position: spawn, sharedPhysicsWorld: shared });
  const physics = installCityPhysics(body, world, { scene });
  const presentation = new PortableVehiclePresentationRuntime({ parent: scene });
  const vehicles = new VehicleScene({ world: shared, parent: scene,
    onComponentVfxFrame: f => presentation.applyComponentVfx(f),
    onComponentVfxRemoved: (host, id) => presentation.removeComponentVfx(host, id),
    supportsComponentVfx: effect => presentation.supportsComponentVfx(effect),
  });
  const web = createWebSystem(scene), slingWebs = createSlingWebs(scene, web), ropeWebs = createRopeWebs(scene);
  const cam = createChaseCamera(camera, world);
  let rig, trav, mp, override = null, frozen = false, drivingTraversal = false, elapsed = 0, lastModel, cameraSettings = null;
  const desired = new THREE.Vector3(), old = new THREE.Vector3(), hand = new THREE.Vector3();
  const lastBodyPosition = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
  function applyCameraSettings() {
    if (!cameraSettings) return;
    const camera = mp.local.services.camera;
    camera?.setLookSensitivity(cameraSettings.mouseSensitivity);
    camera?.setInvert(false, cameraSettings.invertY);
    camera?.setBaseFov(55 + cameraSettings.fovOffset);
  }
  function refreshRig() {
    if (lastModel === mp.local.model) return;
    lastModel = mp.local.model;
    const next = createUniversalRig(lastModel);
    // Keep the adapter object stable: combat, webs and traversal retain it across avatar swaps.
    if (rig) Object.assign(rig, next); else rig = next;
    input.refreshBindings(); applyCameraSettings();
  }
  function syncFromBody(reset = false) {
    const p = body.position;
    if (reset) trav.teleport(new THREE.Vector3(p.x, p.y + H, p.z), body.facingYaw);
    else trav.s.pos.set(p.x, p.y + H, p.z);
  }
  class TraversalAbility {
    manifest = { id: 'spider-traversal', version: '1.0.0', activation: { mode: 'always' }, channels: { movement: { priority: 1 } } };
    onActivate(ctx) { if (ctx.body.networkAuthoritative) return; drivingTraversal = true; if (trav) syncFromBody(true); }
    onDeactivate(ctx) { if (ctx.body.networkAuthoritative) return; drivingTraversal = false; web.release(); }
    onTick(dt, ctx) {
      if (!trav || ctx.body.networkAuthoritative || dt <= 0) return;
      refreshRig(); syncFromBody();
      const locked = frozen || read(ctx.blackboard, 'emoteLocked') || read(ctx.blackboard, 'ragdolled') || read(ctx.blackboard, 'dead');
      if (locked) { ctx.body.move({ x: 0, z: 0 }); if (frozen) ctx.body.moveVertical(0); return; }
      // The platform owns the camera; traversal reads its current facing for anchors and steering.
      cam.yaw = (read(ctx.blackboard, 'cameraYaw') + 180) * Math.PI / 180;
      cam.pitch = -read(ctx.blackboard, 'cameraPitch') * Math.PI / 180;
      input.sling.gate = trav.s.mode === 'ground';
      let intent = input.poll(dt);
      if (override) intent = override(intent, dt, api) ?? { ...intent, move: { x: 0, y: 0 }, swing: false, jump: false, zip: false };
      old.set(ctx.body.position.x, ctx.body.position.y, ctx.body.position.z);
      const jumpRequested = !!intent.jumpPressed;
      trav.update(dt, intent);
      desired.copy(trav.rootPos).sub(old).divideScalar(dt);
      // The room admits 60 m/s player displacement. Keep the complete 3D vector below it,
      // including upgraded dives and web releases, rather than widening platform limits.
      desired.clampLength(0, 55);
      mp.local.blackboard.set('jumpRequested', jumpRequested);
      ctx.body.move(desired); ctx.body.moveVertical(desired.y); ctx.body.setFacingYaw(trav.s.facing);
    }
  }
  mp = await CharacterMultiplayer.create({
    helix: Helix, renderer, scene, camera, body, input: input.router, domElement: renderer.domElement,
    assetBase: SYSTEM_ASSET_BASE, transcoderPath: TRANSCODER_PATH, spawn,
    character: { character: { spawn, camera: { mode: 'third-person', tp: { distance: 5.5 } }, body: { stepHeight: 0.55, terminalVelocity: 55 } } },
    abilities: clips => [new LocomotionAbility(clips), new TraversalAbility()],
    portableVehicles: { scene: vehicles, bindingFor: vehicleSpecialtyPlacementBinding,
      transportFor: (binding, room) => new VehicleSpecialtyRoomTransport(room, binding) },
  });
  refreshRig();
  trav = createTraversal({ world, cam, web, rig, camera });
  syncFromBody(true);
  if (mp.portableVehicles) presentation.setVehicles(mp.portableVehicles);
  mp.entities({ build: (kind, id) => { const root = new THREE.Group(); root.name = `${kind}:${id}`; return { root, update() {}, dispose() { root.removeFromParent(); } }; } });
  input.mountMobile();
  const api = {
    get object() { return mp.local.model; }, rig, web, cam, traversal: trav, state: trav.s, anim: trav.anim,
    mp, body, vehicles, shared, physics,
    get position() { return trav.s.pos; }, get velocity() { return trav.s.vel; }, get heading() { return cam.yaw; },
    get mode() { return drivingTraversal ? trav.s.mode : 'ground'; }, get sub() { return trav.s.sub; },
    get zipTarget() { return trav.targeting.best; }, get zipCandidates() { return trav.targeting.candidates; },
    get aiming() { return input.state?.aimT < 1.6 || input.state?.zip || trav.s.mode === 'perch'; },
    setControlOverride(fn) { override = fn; },
    configureCamera(settings) { cameraSettings = { mouseSensitivity: settings.mouseSensitivity, invertY: !!settings.invertY, fovOffset: settings.fovOffset || 0 }; applyCameraSettings(); },
    get frozen() { return frozen; }, set frozen(value) { frozen = !!value; },
    teleport(p, yaw = 0) {
      if (mp.room) { mp.room.sendAction('travel', { destination: [p.x, p.y - H, p.z] }); return; }
      body.teleport({ x: p.x, y: p.y - H, z: p.z }); body.setFacingYaw(yaw); syncFromBody(true);
    },
    update(dt) {
      if (lastBodyPosition.distanceTo(body.position) > 4) { web.release(); syncFromBody(true); }
      const bb = mp.local.blackboard;
      const nativeMovement = ['ragdolled', 'dead', 'getupDir', 'gettingUp', 'gunDrawn'].some(key => read(bb, key));
      // The outgoing ability manager is empty while an equipped-avatar swap rebuilds it.
      if (mp.local.abilities.has('spider-traversal')) {
        if (nativeMovement) mp.local.abilities.deactivate('spider-traversal');
        else mp.local.abilities.activate('spider-traversal');
      }
      input.setOnFoot(!mp.seatEvidence().local?.seated && !nativeMovement);
      input.updateMobile();
      physics.update(body.position, mp.portableVehicleEvidence().vehicles.map(v => v.transform.position).filter(Boolean));
      shared.step(dt); mp.update(dt); refreshRig();
      elapsed += dt; vehicles.update(elapsed, body.position); presentation.update(dt, body.position);
      if (lastBodyPosition.distanceTo(body.position) > 55 * dt + 4) { web.release(); syncFromBody(true); }
      lastBodyPosition.copy(body.position);
      syncFromBody();
      if (drivingTraversal && !frozen && !['emoteActive', 'helixosDevice', 'helixosCamera', 'gunDrawn', 'ragdolled', 'dead'].some(key => read(mp.local.blackboard, key))) {
        const a = trav.anim;
        // Native locomotion remains the base pose. The original rig-independent traversal poses
        // layer only while airborne; camera, emotes, seated driving and carried items retain ownership.
        if (a.mode === 'swing') rig.applyPose(POSES.swing(a.swing.phase), 1);
        else if (a.mode === 'wall') rig.applyPose(POSES.wallCrawl(a.wall.phase), 1);
        else if (a.mode === 'zip') rig.applyPose(POSES.jump(), 1);
        if (web.active) {
          const side = trav.s.mode === 'swing' ? trav.s.swing.hand : 'R';
          const shoulder = rig.bones['upperArm' + side];
          if (shoulder) { const d = web.anchor.clone().sub(shoulder.getWorldPosition(hand)).normalize(); rig.aimBone('upperArm' + side, d); rig.aimBone('lowerArm' + side, d); }
        }
      }
      web.update(dt, rig.handWorld(trav.s.mode === 'swing' ? trav.s.swing.hand : 'R'), camera, renderer, web.active2 ? rig.handWorld('L', hand) : null);
      slingWebs.update(dt, trav.s.sling, trav.events, rig, camera, renderer);
      ropeWebs.update(dt, trav.s.ropes, rig.handWorld('R', hand), renderer);
      input.updateUI(dt);
    },
    ready() { inspector.ready({ scene, body, spawn }); screenshots.ready({ renderer, scene, camera }); },
    dispose() { input.dispose?.(); physics.dispose(); mp.dispose(); presentation.dispose(); vehicles.dispose?.(); shared.dispose?.(); },
  };
  window.__trav = trav;
  window.portableVehicleEvidence = () => mp.portableVehicleEvidence();
  screenshots.register('hero', { position: [spawn.x + 10, spawn.y + 7, spawn.z - 13], lookAt: [spawn.x, spawn.y + 3, spawn.z], fov: 58 });
  addEventListener('pagehide', () => api.dispose(), { once: true });
  return api;
}
