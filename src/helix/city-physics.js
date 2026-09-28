import { BOX, CYL, RAMP, HF, DEAD } from '../world/collision.js';

const vec = (x, y, z) => ({ x, y, z });

function meshBuilder() {
  const vertices = [], indices = [];
  return {
    triangle(a, b, c) {
      const ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
      if (Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) < 1e-10) return;
      const n = vertices.length / 3;
      vertices.push(...a, ...b, ...c); indices.push(n, n + 1, n + 2);
    },
    quad(a, b, c, d) { this.triangle(a, b, c); this.triangle(a, c, d); },
    finish(position) {
      return { kind: 'trimesh', vertices: Float32Array.from(vertices), indices: Uint32Array.from(indices), position };
    },
  };
}

// Clip a cross-section by a linear inequality. This preserves thin ramp slabs,
// including the corner where their lower plane meets the primitive's base.
function clip(poly, distance) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = distance(a), db = distance(b);
    if (da >= 0) out.push(a);
    if ((da < 0) !== (db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

function rampMesh(b, p) {
  const axis = p[0], length = b[axis + 3] - b[axis], width = axis === 0 ? b[5] - b[2] : b[3] - b[0];
  const yA = p[1] - b[1], yB = p[2] - b[1], height = b[4] - b[1];
  const top = (u) => yA + (yB - yA) * u / length;
  let section = clip([[0, 0], [length, 0], [length, height], [0, height]], ([u, y]) => top(u) - y);
  if (p[3] > 0) section = clip(section, ([u, y]) => y - top(u) + p[3]);
  const m = meshBuilder(), point = ([u, y], w) => axis === 0 ? [u, y, w] : [w, y, u];
  const center = section.reduce((a, v) => [a[0] + v[0] / section.length, a[1] + v[1] / section.length], [0, 0]);
  const inside = point(center, width / 2);
  // Consistently outward faces for both slope axes and both grade directions.
  const tri = (a, b, c) => {
    const ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
    const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (normal.reduce((v, n, i) => v + n * (a[i] - inside[i]), 0) < 0) m.triangle(a, c, b);
    else m.triangle(a, b, c);
  };
  for (let i = 1; i + 1 < section.length; i++) {
    tri(point(section[0], 0), point(section[i], 0), point(section[i + 1], 0));
    tri(point(section[0], width), point(section[i], width), point(section[i + 1], width));
  }
  for (let i = 0; i < section.length; i++) {
    const a = section[i], c = section[(i + 1) % section.length];
    tri(point(a, 0), point(c, 0), point(c, width));
    tri(point(a, 0), point(c, width), point(a, width));
  }
  return m.finish(vec(b[0], b[1], b[2]));
}

function cylinderMesh(b, p) {
  const m = meshBuilder(), r0 = p[2], r1 = p[3], h = b[4] - b[1];
  // Inscribed polygon: less than 1 cm radial error for normal city props.
  const n = Math.max(12, Math.ceil(Math.PI / Math.acos(1 - Math.min(0.01 / Math.max(r0, r1), 1))));
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n, c = (i + 1) * Math.PI * 2 / n;
    const a0 = [Math.cos(a) * r0, 0, Math.sin(a) * r0], c0 = [Math.cos(c) * r0, 0, Math.sin(c) * r0];
    const a1 = [Math.cos(a) * r1, h, Math.sin(a) * r1], c1 = [Math.cos(c) * r1, h, Math.sin(c) * r1];
    if (r0 > 0) m.triangle([0, 0, 0], a0, c0);
    if (r1 > 0) m.triangle([0, h, 0], c1, a1);
    if (r1 > 0) m.triangle(a0, a1, c1);
    if (r0 > 0) m.triangle(a0, c1, c0);
  }
  return m.finish(vec(p[0], b[1], p[1]));
}

function fieldMesh(b, p, field) {
  const m = meshBuilder(), { nx, nz, cell, h, lo } = field;
  const span = (x, z) => {
    if (x < 0 || x >= nx || z < 0 || z >= nz) return null;
    const k = z * nx + x, bottom = lo?.[k] ?? 0;
    return Number.isFinite(h[k]) && h[k] > bottom ? [bottom, h[k]] : null;
  };
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const s = span(x, z); if (!s) continue;
    const [bottom, top] = s, xa = x * cell, xb = (x + 1) * cell, za = z * cell, zb = (z + 1) * cell;
    m.quad([xa, top, za], [xa, top, zb], [xb, top, zb], [xb, top, za]);
    m.quad([xa, bottom, za], [xb, bottom, za], [xb, bottom, zb], [xa, bottom, zb]);
    // Only exposed column wall spans: holes and floating undersides stay open.
    const sides = [
      [x - 1, z, [xa, za], [xa, zb]], [x + 1, z, [xb, zb], [xb, za]],
      [x, z - 1, [xb, za], [xa, za]], [x, z + 1, [xa, zb], [xb, zb]],
    ];
    for (const [xx, zz, a, c] of sides) {
      const neighbor = span(xx, zz);
      const ranges = neighbor ? [[bottom, Math.min(top, neighbor[0])], [Math.max(bottom, neighbor[1]), top]] : [[bottom, top]];
      for (const [low, high] of ranges) if (high > low) m.quad([a[0], low, a[1]], [c[0], low, c[1]], [c[0], high, c[1]], [a[0], high, a[1]]);
    }
  }
  return m.finish(vec(b[0], p[1], b[2]));
}

/** Pure shape conversion, exported for geometry QA. HF means solid columns,
 * not Rapier's interpolated terrain heightfield; converting it to the latter
 * would fill holes and erase the underside of awnings and rooftop equipment. */
export function cityPrimitiveShape(grid, id) {
  if (grid.flags[id] & DEAD) return null;
  const b = grid.bb.subarray(id * 6, id * 6 + 6), p = grid.par.subarray(id * 6, id * 6 + 6);
  switch (grid.type[id]) {
    case BOX: return { kind: 'cuboid', halfExtents: vec((b[3] - b[0]) / 2, (b[4] - b[1]) / 2, (b[5] - b[2]) / 2), position: vec((b[3] + b[0]) / 2, (b[4] + b[1]) / 2, (b[5] + b[2]) / 2) };
    case CYL: return cylinderMesh(b, p);
    case RAMP: return rampMesh(b, p);
    case HF: return fieldMesh(b, p, grid.fields[p[0]]);
    default: throw new Error(`Unsupported city collider ${grid.type[id]}`);
  }
}

/** Rendered base terrain already has exact curb edges, park pond holes, and
 * shoreline polygons. Never use groundHeight here: it includes roofs/water. */
export function isCityTerrainMesh(mesh) {
  return mesh.isMesh && !mesh.isInstancedMesh && (/^(asphalt|sidewalks|park|mapLawns|parkPaths|seawall\+parkwall|palisadesCliff)$/.test(mesh.name)
    || /^(farLand-|coast-|coastLawn-)/.test(mesh.name));
}

export function terrainMeshShape(mesh) {
  const p = mesh.geometry.attributes.position, vertices = new Float32Array(p.count * 3), e = mesh.matrixWorld.elements;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    vertices[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
    vertices[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    vertices[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  const index = mesh.geometry.index;
  return { kind: 'trimesh', vertices, indices: index ? Uint32Array.from(index.array) : Uint32Array.from({ length: p.count }, (_, i) => i) };
}

/** Install after RapierBody.create({ sharedPhysicsWorld }): its public addStatic*
 * methods mirror geometry to vehicles and ragdolls automatically.
 *
 * const physics = installCityPhysics(body, city, { scene });
 * physics.update(playerPosition, vehiclePositions); // BEFORE the physics step
 * physics.dispose(); // BEFORE disposing body
 *
 * Terrain is installed once from rendered geometry (no water collision). City
 * solids stream within radius of every supplied anchor, with all altitudes
 * retained. Supply every active vehicle position, including parked vehicles,
 * to preserve their support when the player travels elsewhere. No map bounds
 * are imposed, so bridges and far-shore solids remain reachable.
 */
export function installCityPhysics(body, world, { scene = world.scene, radius = 144, refreshDistance = 24 } = {}) {
  if (!scene?.traverse || !world.collision) throw new Error('City physics needs the built city collision grid and { scene }');
  if (!(radius > refreshDistance && refreshDistance > 0)) throw new Error('City physics radius must exceed its positive refresh distance');
  const grid = world.collision, active = new Map(), terrain = [], size = 96, buckets = new Map();
  let last = [], disposed = false;
  const add = (s, id) => s.kind === 'cuboid'
    ? body.addStaticCuboid(s.halfExtents, s.position, undefined, { id })
    : s.indices.length ? body.addStaticTrimesh(s.vertices, s.indices, s.position, { id }) : null;
  scene.updateMatrixWorld(true);
  scene.traverse((mesh) => {
    if (isCityTerrainMesh(mesh)) {
      const handle = add(terrainMeshShape(mesh), `city:terrain:${mesh.uuid}`);
      if (handle !== null) terrain.push(handle);
    }
  });
  if (!terrain.length) throw new Error('City physics found no rendered terrain');
  for (let id = 0; id < grid.n; id++) {
    if (grid.flags[id] & DEAD) continue;
    const j = id * 6;
    for (let z = Math.floor(grid.bb[j + 2] / size); z <= Math.floor(grid.bb[j + 5] / size); z++) {
      for (let x = Math.floor(grid.bb[j] / size); x <= Math.floor(grid.bb[j + 3] / size); x++) {
        const key = `${x},${z}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(id);
      }
    }
  }
  const api = {
    update(position, vehiclePositions = []) {
      if (disposed) return;
      const anchors = [position, ...vehiclePositions];
      if (anchors.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.z))) throw new Error('City physics anchors must have finite x/z');
      if (last.length === anchors.length && anchors.every((p, i) => Math.hypot(p.x - last[i].x, p.z - last[i].z) < refreshDistance)) return;
      last = anchors.map(p => ({ x: p.x, z: p.z }));
      const wanted = new Set();
      for (const p of anchors) for (let z = Math.floor((p.z - radius) / size); z <= Math.floor((p.z + radius) / size); z++) {
        for (let x = Math.floor((p.x - radius) / size); x <= Math.floor((p.x + radius) / size); x++) {
          for (const id of buckets.get(`${x},${z}`) ?? []) {
            const j = id * 6, dx = Math.max(grid.bb[j] - p.x, 0, p.x - grid.bb[j + 3]), dz = Math.max(grid.bb[j + 2] - p.z, 0, p.z - grid.bb[j + 5]);
            if (dx * dx + dz * dz <= radius * radius && !(grid.flags[id] & DEAD)) wanted.add(id);
          }
        }
      }
      for (const id of wanted) if (!active.has(id)) {
        const handle = add(cityPrimitiveShape(grid, id), `city:solid:${id}`);
        if (handle !== null) active.set(id, handle);
      }
      for (const [id, handle] of active) if (!wanted.has(id)) { body.removeCollider(handle); active.delete(id); }
    },
    get stats() { return { terrain: terrain.length, solids: active.size }; },
    dispose() {
      if (disposed) return;
      for (const handle of terrain) body.removeCollider(handle);
      for (const handle of active.values()) body.removeCollider(handle);
      terrain.length = 0; active.clear(); buckets.clear(); disposed = true;
    },
  };
  api.update(world.spawn);
  return api;
}
