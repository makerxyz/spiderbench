import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Solids, CollisionGrid } from '../src/world/collision.js';
import { cityPrimitiveShape, terrainMeshShape, isCityTerrainMesh, installCityPhysics } from '../src/helix/city-physics.js';

const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);
function fixture(build) {
  const solids = new Solids();
  build(solids);
  const grid = new CollisionGrid(solids);
  return { grid, shape: cityPrimitiveShape(grid, 0) };
}
function hits(shape, origin, direction) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(shape.vertices, 3));
  geometry.setIndex(new THREE.BufferAttribute(shape.indices, 1));
  const material = new THREE.MeshBasicMaterial(); // FrontSide also checks face winding.
  const mesh = new THREE.Mesh(geometry, material);
  if (shape.position) mesh.position.copy(shape.position);
  mesh.updateMatrixWorld(true);
  const found = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction)).intersectObject(mesh);
  geometry.dispose(); material.dispose();
  return found;
}

test('boxes keep their actual center and dimensions; removed primitives stay absent', () => {
  const { grid, shape } = fixture(s => s.box(10, 2, -4, 18, 12, 2));
  assert.deepEqual(shape, { kind: 'cuboid', position: { x: 14, y: 7, z: -1 }, halfExtents: { x: 4, y: 5, z: 3 } });
  grid.flags[0] = 4;
  assert.equal(cityPrimitiveShape(grid, 0), null);
});

for (const axis of [0, 2]) for (const descending of [false, true]) {
  test(`bridge ramp axis ${axis}, descending ${descending}: matches slope and open underside`, () => {
    const yA = descending ? 14 : 4, yB = descending ? 4 : 14;
    const { shape } = fixture(s => s.ramp(10, 3, 20, 30, 40, axis, yA, yB, 'roof', 0, 1));
    for (const t of [0.13, 0.43, 0.83]) {
      const x = axis === 0 ? 10 + t * 20 : 17, z = axis === 2 ? 20 + t * 20 : 27;
      const top = yA + t * (yB - yA);
      near(hits(shape, [x, 30, z], [0, -1, 0])[0].point.y, top);
      near(hits(shape, [x, 0, z], [0, 1, 0])[0].point.y, top - 1);
    }
    // This would hit the side of an incorrectly flattened AABB.
    assert.equal(hits(shape, [0, 2.5, 27], [1, 0, 0]).length, 0);
  });
}

test('ramp lower plane clipping retains the base corner instead of extending below its AABB', () => {
  const { shape } = fixture(s => s.ramp(0, 2, 0, 10, 10, 0, 2, 12, 'awning', 0, 3));
  near(hits(shape, [1, 0, 4], [0, 1, 0])[0].point.y, 2);
  near(hits(shape, [7, 0, 4], [0, 1, 0])[0].point.y, 6);
});

test('tapered tower preserves circular footprint and sloping wall to under 1 cm', () => {
  const { shape } = fixture(s => s.cyl(5, 8, 2, 12, 4, 1));
  assert.equal(hits(shape, [8.8, 20, 11.8], [0, -1, 0]).length, 0);
  near(hits(shape, [5, 20, 8], [0, -1, 0])[0].point.y, 12);
  near(hits(shape, [15, 7, 8], [-1, 0, 0])[0].point.x, 7.5, 0.011);
  near(hits(shape, [5, 0, 8], [0, 1, 0])[0].point.y, 2);
});

test('HF retains empty cells, distinct column tops, and elevated undersides', () => {
  const { shape } = fixture(s => {
    const field = s.addField({ nx: 3, nz: 1, cell: 1, h: new Float32Array([4, -Infinity, 6]), lo: new Float32Array([3, 0, 2]), hMax: 6, loMin: 2 });
    s.hfield(10, 20, 30, field);
  });
  near(hits(shape, [10.5, 40, 30.5], [0, -1, 0])[0].point.y, 24);
  near(hits(shape, [12.5, 40, 30.5], [0, -1, 0])[0].point.y, 26);
  assert.equal(hits(shape, [11.5, 40, 30.5], [0, -1, 0]).length, 0);
  near(hits(shape, [10.5, 0, 30.5], [0, 1, 0])[0].point.y, 23);
  near(hits(shape, [0, 23.5, 30.5], [1, 0, 0])[0].point.x, 10);
  near(hits(shape, [11.5, 23.5, 30.5], [-1, 0, 0])[0].point.x, 11);
});

test('adjacent HF columns expose only the differing spans', () => {
  const { shape } = fixture(s => {
    const field = s.addField({ nx: 2, nz: 1, cell: 1, h: new Float32Array([4, 6]), lo: new Float32Array([1, 2]), hMax: 6, loMin: 1 });
    s.hfield(0, 0, 0, field);
  });
  near(hits(shape, [0.5, 5, 0.5], [1, 0, 0])[0].point.x, 1);
  near(hits(shape, [1.5, 1.5, 0.5], [-1, 0, 0])[0].point.x, 1);
  // No internal wall through their overlapping solid span.
  assert.equal(hits(shape, [0.5, 3, 0.5], [1, 0, 0]).length, 0);
});

test('terrain uses rendered transforms and holes, and excludes all water meshes', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 2, 2, 0, 0], 3));
  const mesh = new THREE.Mesh(geometry);
  mesh.name = 'asphalt'; mesh.position.set(10, 2, 20); mesh.updateMatrixWorld(true);
  assert.equal(isCityTerrainMesh(mesh), true);
  const shape = terrainMeshShape(mesh);
  near(hits(shape, [10.2, 10, 20.2], [0, -1, 0])[0].point.y, 2);
  assert.equal(hits(shape, [11.8, 10, 21.8], [0, -1, 0]).length, 0);
  for (const name of ['water', 'river', 'parkWater', 'coastPickets-1', 'farCity']) {
    mesh.name = name; assert.equal(isCityTerrainMesh(mesh), false, name);
  }
  geometry.dispose(); mesh.material.dispose();
});

test('Rapier accepts bridge slab geometry and a dynamic body settles on its actual slope', async () => {
  const { default: RAPIER } = await import('@dimforge/rapier3d-compat');
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  try {
    const { shape } = fixture(s => s.ramp(0, 1, 0, 20, 10, 0, 2, 6, 'roof', 0, 1));
    world.createCollider(RAPIER.ColliderDesc.trimesh(shape.vertices, shape.indices).setTranslation(...Object.values(shape.position)));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(10, 8, 5).lockTranslations().enabledTranslations(false, true, false));
    world.createCollider(RAPIER.ColliderDesc.ball(0.5), body);
    for (let i = 0; i < 240; i++) world.step();
    near(body.translation().y, 4 + 0.5 * Math.sqrt(1.04), 0.015);
    const below = world.castRay(new RAPIER.Ray({ x: 10, y: 0, z: 5 }, { x: 0, y: 1, z: 0 }), 10, true);
    near(below.timeOfImpact ?? below.toi, 3, 0.001);
  } finally { world.free(); }
});


test('streaming retains parked vehicle support and removes only unneeded colliders', () => {
  const solids = new Solids();
  solids.box(-2, 0, -2, 2, 2, 2);
  solids.box(998, 0, -2, 1002, 2, 2);
  const scene = new THREE.Scene();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial());
  ground.name = 'asphalt'; ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const active = new Set();
  const body = {
    addStaticCuboid(_half, _position, _rotation, { id }) { active.add(id); return id; },
    addStaticTrimesh(_vertices, _indices, _position, { id }) { active.add(id); return id; },
    removeCollider(id) { assert.equal(active.delete(id), true); },
  };
  const physics = installCityPhysics(body, { collision: new CollisionGrid(solids), spawn: { x: 0, z: 0 } }, { scene });
  assert.equal(active.has('city:solid:0'), true);
  physics.update({ x: 1000, z: 0 }, [{ x: 0, z: 0 }]);
  assert.equal(active.has('city:solid:0'), true);
  assert.equal(active.has('city:solid:1'), true);
  physics.update({ x: 1000, z: 0 });
  assert.equal(active.has('city:solid:0'), false);
  assert.equal(active.has('city:solid:1'), true);
  assert.equal(physics.stats.terrain, 1);
  physics.dispose(); physics.dispose(); assert.equal(active.size, 0);
  ground.geometry.dispose(); ground.material.dispose();
});
