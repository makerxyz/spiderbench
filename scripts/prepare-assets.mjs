import { mkdir, readdir, readFile, rm, stat, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public');
const destination = path.join(root, 'public-optimized');
const MiB = 1024 * 1024;

// These authored originals remain in public/. The HELIX avatar replaces the player
// model; thug base colour is embedded in its GLB and its variants already use WebP.
const omitted = new Map([
  ['assets/spiderman.glb', 'Replaced by the platform avatar'],
  ['assets/tex/suit_normal.png', 'Replaced by the platform avatar'],
  ['assets/tex/suit_weave_hex.png', 'Replaced by the platform avatar'],
  ['assets/tex/suit_weave_knit.png', 'Replaced by the platform avatar'],
  ['assets/tex/thug_basecolor.png', 'Embedded in thug.glb'],
  ['assets/tex/thug_basecolor_b.png', 'Runtime uses the WebP variant'],
  ['assets/tex/thug_basecolor_c.png', 'Runtime uses the WebP variant'],
  ['assets/city/tex/vehicles_atlas.png', 'Superseded by vehicles_atlas2.webp'],
  ['assets/city/tex/vehicles_atlas.json', 'Metadata for the superseded vehicle atlas'],
]);

// The browser expands these losslessly before passing bytes to the existing loaders.
const compressedGeometry = new Set([
  'assets/city/npc/people.bin', 'assets/city/vehicles.glb',
  'assets/city/props.glb', 'assets/thug.glb',
]);

// These are vertical arrays of square layers, not individual tall textures.
// Applying a 2048px cap to the entire strip destroys facade and rooftop detail.
const arrays = new Set([
  'walls_col', 'walls_nrm', 'walls_hao', 'roof_col', 'roof_nrm', 'bark_col', 'bark_nrm',
]);

async function* files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* files(file);
    else if (entry.isFile() && entry.name !== '.DS_Store') yield file;
    else if (entry.isSymbolicLink()) throw new Error(`Public assets must not be symlinks: ${file}`);
  }
}

export function dimensions(name, width, height) {
  if (arrays.has(name)) {
    const layers = height / width;
    if (!Number.isInteger(layers)) throw new Error(`Invalid square-layer array: ${name}`);
    // WebP's dimension limit is 16383. Keep an integral layer size and preserve
    // the exact layer count (walls_col only drops from 1024 to 1023 per layer).
    const layerLimit = name === 'walls_hao' ? 128 : name === 'walls_nrm' ? 256 : 2048;
    const side = Math.min(width, layerLimit, Math.floor(16383 / layers));
    return { width: side, height: side * layers, layers };
  }
  const maximum = /(?:_nrm|_normal)$/.test(name) || name === 'asphalt_macro' ? 512 : 2048;
  const ratio = Math.min(1, maximum / Math.max(width, height));
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

export async function prepareAssets() {
  await mkdir(destination, { recursive: true });
  let previous = {};
  try { previous = JSON.parse(await readFile(path.join(destination, 'asset-manifest.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  // Bump the recipe version when compression settings or classification change.
  const manifest = { version: 5, files: {}, omitted: {}, totalBytes: 0 };
  const hash = data => createHash('sha256').update(data).digest('hex');
  const targets = new Set();
  let originalBytes = 0;
  for await (const file of files(source)) {
    const relative = path.relative(source, file).split(path.sep).join('/');
    const bytes = (await stat(file)).size;
    originalBytes += bytes;
    if (omitted.has(relative) || /^helix_modules\/.*(?:\.d\.ts|\.map)$/.test(relative)) {
      manifest.omitted[relative] = omitted.get(relative) || 'Build-time platform declarations/source maps';
      continue;
    }
    const sourceData = await readFile(file);
    const sourceHash = hash(sourceData);
    const cached = previous.version === manifest.version && previous.files?.[relative];
    if (cached?.sourceHash === sourceHash) {
      try {
        const data = await readFile(path.join(destination, cached.path));
        if (data.length === cached.bytes && hash(data) === cached.outputHash) {
          targets.add(cached.path);
          manifest.files[relative] = cached;
          manifest.totalBytes += cached.bytes;
          continue;
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const extension = path.extname(file).toLowerCase();
    let target = relative;
    let buffer;
    let details = {};
    if (compressedGeometry.has(relative)) {
      target = relative + '.bin';
      buffer = gzipSync(sourceData, { level: 9 });
      details = { compression: 'gzip' };
    } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
      const metadata = await sharp(file).metadata();
      const name = path.basename(file, extension);
      const size = dimensions(name, metadata.width, metadata.height);
      const resized = size.width !== metadata.width || size.height !== metadata.height;
      const dataMap = /(?:_nrm|_normal|_hao|_r)$/.test(name) || ['noise', 'asphalt_macro', 'asphalt_decals', 'leaves', 'people_bake'].includes(name);
      if (extension !== '.webp' || resized || (bytes > MiB && name !== 'people_bake')) {
        target = relative.replace(/\.(?:png|jpe?g|webp)$/i, '.webp');
        let pipeline = sharp(file);
        if (resized) pipeline = pipeline.resize(size.width, size.height, { fit: 'fill' });
        // Near-lossless WebP avoids lossy chroma subsampling on normal/data maps.
        // Colour atlases keep high quality, alpha, layer counts, and UV layouts.
        buffer = await pipeline.webp(dataMap
          ? { nearLossless: true, quality: 75, effort: 3 }
          : { quality: 80, alphaQuality: 100, effort: 3 }).toBuffer();
      }
      details = { width: size.width, height: size.height, ...(size.layers ? { layers: size.layers } : {}) };
    }
    if (targets.has(target)) throw new Error(`Asset output collision: ${target}`);
    targets.add(target);
    const output = path.join(destination, target);
    await mkdir(path.dirname(output), { recursive: true });
    if (buffer) await writeFile(output, buffer);
    else await copyFile(file, output);
    const outputBytes = buffer?.length ?? bytes;
    manifest.files[relative] = { path: target, bytes: outputBytes, sourceHash, outputHash: buffer ? hash(buffer) : sourceHash, ...details };
    manifest.totalBytes += outputBytes;
  }
  for await (const file of files(destination)) {
    const relative = path.relative(destination, file).split(path.sep).join('/');
    if (relative !== 'asset-manifest.json' && !targets.has(relative)) await rm(file);
  }
  await writeFile(path.join(destination, 'asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const actualBytes = manifest.totalBytes + (await stat(path.join(destination, 'asset-manifest.json'))).size;
  console.log(`Prepared ${targets.size} assets: ${(originalBytes / MiB).toFixed(2)} -> ${(actualBytes / MiB).toFixed(2)} MiB`);
  for (const entry of Object.values(manifest.files).sort((a, b) => b.bytes - a.bytes).slice(0, 10)) {
    console.log(`${(entry.bytes / MiB).toFixed(2).padStart(6)} MiB  ${entry.path}`);
  }
  if (actualBytes >= 45 * MiB) throw new Error(`Prepared assets exceed the 45 MiB budget: ${(actualBytes / MiB).toFixed(2)} MiB`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareAssets();
}
