# Shared simulation

Strict TypeScript migration of the preserved `web/engine.js`, `web/progression.js` and `web/equipment.js` prototype. The server consumes CommonJS build output; Vite consumes `src/index.ts` through its simulation alias.

```sh
npx tsc -p packages/simulation/tsconfig.json
node --test packages/simulation/tests/*.test.cjs
```

`Game` implements `GameState`. Local practice can render the game directly; network transport can serialize the same state fields. `GameOptions` and `InputState` describe the existing constructor and per-slot controls. `validateMap` and `Progression.normalizeProfile` accept unknown JSON and validate it before typed use.

Public exports: `Game`, `campaign`, `blankMap`, `validateMap`, `TILE`, `DIRS`, `clamp`, `Progression`, `Equipment`, plus domain interfaces from `types.ts`. No gameplay changes are introduced in this migration. Parity tests compare deterministic state, all 12 maps, normalized profiles and all four Boss shield mechanisms against the preserved prototype.
