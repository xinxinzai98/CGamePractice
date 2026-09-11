# Shared simulation

Strict TypeScript rules shared by the authoritative server and local practice. The server consumes CommonJS build output; Vite consumes `src/index.ts` through its simulation alias. The original `web/` prototype remains frozen for historical comparison.

```sh
npx tsc -p packages/simulation/tsconfig.json
node --test packages/simulation/tests/*.test.cjs
```

`Game` implements `GameState`. Local practice renders the simulation directly; multiplayer transports snapshots plus separately sequenced events. `GameOptions` and `InputState` describe the constructor and per-slot controls. Validate external maps once with `validateMap`. Current profiles use strict `Progression.parseProfile`; legacy imports use `Progression.migrateLegacyProfile` at the migration boundary.

`content.ts` owns stable level IDs, authored terrain/encounters, and Boss phase/attack definitions. Dynamic gates, objectives and locked attack telegraphs live in `GameState`, so collision rules and rendering share the same data. `CHARACTERS` describes the two existing playable pilots; adding recruitable characters requires an explicit profile migration and appropriate assets.

Exports include `Game`, `campaign`, `blankMap`, `validateMap`, `TILE`, `DIRS`, `clamp`, `Progression`, `Equipment`, `LEVELS`, `BOSSES`, `CHARACTERS`, and domain types. Parity tests retain the original two maps and baseline combat comparison. New content tests verify cooperation, gate collision, readable phase transitions and complete Boss playthroughs using control inputs, without teleporting players or overwriting enemy HP.
