import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWarmup } from '../src/render/warmup.js';

test('city shader warmup batches each render variant and restores renderer state', async () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  for (let i = 0; i < 100; i++) { const mesh = new THREE.Mesh(geometry, material); mesh.layers.enable(2); scene.add(mesh); }
  const target = {}, calls = [];
  const renderer = {
    info: { programs: [] }, shadowMap: { enabled: true }, target,
    getRenderTarget() { return this.target; }, setRenderTarget(value) { this.target = value; },
    compile(root) { let count = 0; root.traverse(() => count++); calls.push({ count, shadows: this.shadowMap.enabled }); this.info.programs.push({ isReady: () => true }); },
  };
  const warmup = createWarmup(renderer, scene, camera, { mirrorLayers: [2] });
  warmup.rescan(); warmup.flush(); await warmup.settle();
  assert.deepEqual(calls, [{ count: 100, shadows: true }, { count: 100, shadows: false }]);
  assert.equal(renderer.target, target); assert.equal(renderer.shadowMap.enabled, true);
  assert.equal(warmup.pending, 0); warmup.rescan(); assert.equal(warmup.pending, 0);
  geometry.dispose(); material.dispose();
});
