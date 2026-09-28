import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';
import { dimensions } from '../scripts/prepare-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public-optimized');

test('texture arrays retain their layer count and facade detail', () => {
  assert.deepEqual(dimensions('walls_col', 1024, 16384), { width: 1023, height: 16368, layers: 16 });
  assert.deepEqual(dimensions('walls_nrm', 512, 8192), { width: 256, height: 4096, layers: 16 });
  assert.deepEqual(dimensions('roof_col', 512, 9728), { width: 512, height: 9728, layers: 19 });
  assert.deepEqual(dimensions('ts_ads', 4096, 4096), { width: 2048, height: 2048 });
  assert.deepEqual(dimensions('ts_ticker', 4096, 128), { width: 2048, height: 64 });
});

test('prepared asset manifest describes usable files within the publication budget', async () => {
  const manifest = JSON.parse(await readFile(path.join(output, 'asset-manifest.json'), 'utf8'));
  let bytes = 0;
  for (const [source, entry] of Object.entries(manifest.files)) {
    const file = path.join(output, entry.path);
    assert.equal((await stat(file)).size, entry.bytes, source);
    bytes += entry.bytes;
    if (entry.width) {
      const metadata = await sharp(file).metadata();
      assert.equal(metadata.width, entry.width, source);
      assert.equal(metadata.height, entry.height, source);
      if (entry.layers) assert.equal(metadata.height / metadata.width, entry.layers, source);
      else assert.ok(Math.max(metadata.width, metadata.height) <= 2048, source);
    }
  }
  assert.equal(bytes, manifest.totalBytes);
  assert.ok(bytes < 45 * 1024 * 1024, `${bytes} exceeds the 45 MiB asset budget`);
  for (const source of Object.keys(manifest.omitted)) {
    await assert.rejects(stat(path.join(output, source)), { code: 'ENOENT' });
    assert.ok((await stat(path.join(root, 'public', source))).size > 0, `Original preserved: ${source}`);
  }
  for (const critical of ['assets/city/vehicles.glb', 'assets/city/props.glb', 'assets/city/npc/people.bin', 'assets/thug.glb']) {
    assert.equal(manifest.files[critical].compression, 'gzip');
    assert.deepEqual(gunzipSync(await readFile(path.join(output, manifest.files[critical].path))), await readFile(path.join(root, 'public', critical)));
  }
});

test('normal-map compression preserves data channels without chroma artifacts', async () => {
  for (const name of ['assets/city/props/leaves_nrm', 'assets/city/tex/asphalt_nrm', 'assets/city/tex/walls_nrm']) {
    const extension = name.endsWith('walls_nrm') ? '.webp' : '.png';
    const outputFile = path.join(output, name + '.webp');
    const metadata = await sharp(outputFile).metadata();
    const original = await sharp(path.join(root, 'public', name + extension)).resize(metadata.width, metadata.height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    const prepared = await sharp(outputFile).ensureAlpha().raw().toBuffer();
    assert.equal(prepared.length, original.length, name);
    let maximumError = 0;
    for (let i = 0; i < original.length; i++) {
      if (i % 4 === 3 || original[i - i % 4 + 3] === 0) continue;
      maximumError = Math.max(maximumError, Math.abs(original[i] - prepared[i]));
    }
    assert.ok(maximumError <= 3, `${name}: maximum channel error ${maximumError}/255`);
  }
});
