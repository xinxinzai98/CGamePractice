import path from 'node:path';
const simulation = new URL('../../packages/simulation/dist/index.js', import.meta.url).href;
export function resolve(specifier, context, nextResolve) {
  if (specifier === '@dawn/simulation') return nextResolve(simulation, context);
  if (
    context.parentURL?.includes('/client/src/') &&
    specifier.startsWith('.') &&
    !path.extname(specifier)
  ) {
    return nextResolve(specifier + '.ts', context);
  }
  return nextResolve(specifier, context);
}
