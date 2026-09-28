export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@helix/humanoid-character') return { url: new URL('../../public/helix_modules/humanoid-character/index.js', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
