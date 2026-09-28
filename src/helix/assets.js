// Geometry is gzip-compressed at build time; decompress explicitly so static hosts do not
// need Content-Encoding metadata. Paths remain relative to the published build.
export async function fetchGeometry(path) {
  const response = await fetch(new URL(`${path}.bin`, document.baseURI));
  if (!response.ok) throw new Error(`Asset ${path}: HTTP ${response.status}`);
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
export async function loadGeometry(loader, path) {
  return loader.parseAsync(await fetchGeometry(path), new URL('.', new URL(path, document.baseURI)).href);
}
