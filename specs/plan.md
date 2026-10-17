# Zip Zap — Technical Plan (MVP)

> Status: **Approved v0.1** · Implements `spec.md` v0.2 · Last updated 2026-10-17
>
> This document describes **how** the game will be built. When it conflicts with the spec, the spec wins, unless the conflict is recorded in §11 (Spec clarifications).

---

## 1. Summary

A static, client-only web app written in **TypeScript**. The core is a **headless simulation engine** with no dependency on the UI or the browser. Levels are **typed data modules**, and every level ships with a **reference solution** that automated tests check. The UI is **React**, with an **SVG** circuit editor. Progress is saved to **localStorage**, with a versioned save format.

The key architectural decision: **a chip runs as a single behavioural component**, simulated from its level's specification rather than by expanding the player's design inside it. That is exactly what the spec requires (§5.4). It also means simulation cost depends on how many components are _on screen_, not how many are nested, which is what will let the future CPU phase run fast.

## 2. Tech stack

| Concern              | Choice                                        | Why                                                                                                                                                                    |
| -------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language             | TypeScript (strict)                           | Typed level data and engine; safe refactors as the game grows into the CPU phase                                                                                       |
| Build / dev server   | Vite                                          | Fast, minimal config, static output                                                                                                                                    |
| UI                   | React 19                                      | Mature, good tooling; panels and screens are ordinary UI work                                                                                                          |
| Editor rendering     | SVG (React-rendered)                          | Crisp at any zoom; easy hit-testing and CSS styling; enough for ≤ a few hundred elements. Rendering sits behind a thin layer so it can move to Canvas later if needed. |
| State                | Zustand + Immer                               | Small and simple; Immer gives cheap immutable snapshots for undo/redo                                                                                                  |
| Runtime validation   | Zod                                           | Validate imported save files and migrations                                                                                                                            |
| Unit / content tests | Vitest                                        | Same toolchain as Vite; fast                                                                                                                                           |
| End-to-end tests     | Playwright                                    | Real-browser tests for the critical player journeys                                                                                                                    |
| Package manager      | pnpm (Node 24)                                | Already installed                                                                                                                                                      |
| Lint / format        | ESLint + Prettier                             | Standard                                                                                                                                                               |
| Hosting              | Static site (GitHub Pages / Netlify / Vercel) | No backend needed; decided at release                                                                                                                                  |

Library versions: latest stable at scaffold time, pinned in the lockfile.

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ ui/  (React)                                                 │
│  screens: Map · Level · Sandbox · Settings                   │
│  editor:  Canvas(SVG) · ComponentView · WireView · Toolbox   │
│  panels:  GoalTable · StepTable · Waveform · Results ·       │
│           ConceptCard · Hints · Metrics                      │
├──────────────────────────────────────────────────────────────┤
│ state/  (Zustand)                                            │
│  editorStore (circuit + undo/redo + selection + live sim)    │
│  progressStore (solved, bests, unlocked)  settingsStore      │
├───────────────────────────────┬──────────────────────────────┤
│ content/                      │ persistence/                 │
│  chapters, levels, behaviours,│  localStorage adapter,       │
│  concept cards, hints         │  versioned schema, migrate,  │
│                               │  export / import             │
├───────────────────────────────┴──────────────────────────────┤
│ engine/  (pure TS: no DOM, no React)                         │
│  model · validate · compile · simulate · testRunner · metrics│
└──────────────────────────────────────────────────────────────┘
```

**Dependency rule:** arrows point downward only. `engine/` imports nothing from the app. `content/` imports only `engine/` types and helpers.

### Folder layout

```
src/
  engine/
    model.ts          # Circuit, ComponentInstance, Wire, PinRef, ComponentKind
    primitives.ts     # power, const0/1, relayNO/NC, nand, io pins
    chips.ts          # ChipDef + behavioural component adapter
    validate.ts       # shorts, multiple wires into one input, dangling refs, toolbox rules
    compile.ts        # Circuit → Netlist (nets, drivers, readers)
    simulate.ts       # unit-delay event-driven simulator
    testRunner.ts     # combinational + sequential test execution
    metrics.ts        # component count, delay (static analysis)
    builder.ts        # code-first circuit builder (used by tests & reference solutions)
  content/
    levels/ch0.ts … ch4.ts
    registry.ts       # ordered levels, chip lookup, unlock graph
    concepts/         # concept-card markdown
  state/
  persistence/
  ui/
  app/
tests/
  engine/  content/  e2e/
specs/
```

## 4. Engine design

### 4.1 Circuit model (what is saved and edited)

```ts
type ComponentKind =
  | 'power'
  | 'const0'
  | 'const1'
  | 'relayNO'
  | 'relayNC'
  | 'nand'
  | 'in'
  | 'out' // level IO, fixed at canvas edges
  | `chip:${ChipId}`; // any unlocked chip, e.g. 'chip:xor'

interface ComponentInstance {
  id: string;
  kind: ComponentKind;
  pos: { x: number; y: number }; // grid units
  rot: 0 | 90 | 180 | 270;
  label?: string; // for 'in'/'out': the pin name, e.g. 'A', 'SUM'
}

interface PinRef {
  comp: string;
  pin: string;
}
interface Wire {
  id: string;
  from: PinRef;
  to: PinRef;
  bends?: { x: number; y: number }[];
}

interface Circuit {
  components: ComponentInstance[];
  wires: Wire[];
}
```

Layout (position, rotation, bend points) lives in the circuit, but simulation ignores it.

### 4.2 Component definitions

Every kind resolves to a `ComponentDef`:

```ts
interface ComponentDef {
  kind: ComponentKind;
  inputs: string[]; // pin names
  outputs: string[];
  wiredOrOutput?: boolean; // true only for relays (spec §5.2)
  init(): State; // stateless components return null
  step(inputs: Bits, state: State): { outputs: Bits; state: State };
}
```

- **Primitives** are hand-written: `nand`, `relayNO` (`out = in & coil`), `relayNC` (`out = in & !coil`), `power`, `const0/1`.
- **Chips** are generated from the level that unlocks them (§5.1). A combinational chip wraps its truth function. A sequential chip wraps a small state machine (for example a DFF stores `q` and `prevClk`).
- Every component has a **1-tick delay**: outputs computed at tick _t_ appear on nets at tick _t+1_.

### 4.3 Compile: Circuit → Netlist

1. Validate (§4.6).
2. Build **nets**. Each net is one output pin plus every input pin wired to it. Relay outputs wired to the same input, or to each other, merge into one net with several drivers. The net's value is the **OR** of its drivers (wired-OR).
3. Produce flat arrays for speed: `netValue: Uint8Array`, `componentInputs: Int32Array[]`, `fanout: Int32Array[]` (net → components that read it).

**Wired-OR wiring rule.** In the editor, players join relay outputs by wiring each one to the same destination input. Because the spec allows only one wire per input pin, a junction is needed: wiring a second relay output to an input that already has a relay-driven wire **joins the nets** instead of being rejected. This is shown with a junction dot. The rule applies only when every driver involved is a relay output; otherwise it is a short (§4.6).

### 4.4 Simulation: unit-delay, event-driven

```
settle(maxTicks):
  dirty = components whose input nets changed (initially all)
  for tick in 1..maxTicks:
    if dirty is empty: return STABLE(tick)
    compute new outputs for every component in dirty   (reads current netValues)
    apply all output changes at once                    (synchronous update → exact unit delay)
    dirty = readers of every net whose value changed
  return UNSTABLE
```

- **Synchronous updates** (compute everything first, then apply) give a deterministic unit delay, which matches the spec's "one tick" rule exactly.
- `maxTicks = 64 + 4 × componentCount`. This is generous for any acyclic depth, and short enough to catch oscillation quickly.
- **Stateful chips** update their state only in the compute phase of a tick where they are evaluated. Because every input change makes a component "dirty", edge detection works.
- **Live play mode** reuses the same `settle`. When the player toggles an input, the UI either calls `settle` directly or, for animation, steps one tick per frame.

**Oscillation note.** A symmetric NOR SR latch whose inputs all start OFF oscillates under exact unit delay. Real hardware is _metastable_ in the same situation. We keep this honest behaviour:

- Sequential test sequences always start with a **forcing step** (for example Reset ON), so a correct latch settles deterministically.
- In live mode, an unstable circuit shows an "oscillating" badge instead of freezing, and the SR Latch concept card explains why.

### 4.5 Test runner

```ts
type Goal =
  | { kind: 'combinational'; fn: (inp: Bits) => Bits; display: 'table' | { formula: string } }
  | { kind: 'sequential'; model: SeqModel; sequences: Step[][] };

interface Step {
  set: Partial<Bits>;
  expect?: 'model' | Partial<Bits>;
}
```

- **Combinational:** enumerate all 2ⁿ input rows. Reset the netlist each time, apply inputs, `settle`, compare outputs with `fn`. For n=9 (4-bit adder) that is 512 rows × a few dozen components, which takes well under 100 ms.
- **Sequential:** for each sequence, reset all state, then for each step apply its inputs, `settle`, and compare outputs. Expected values are **computed by running the level's reference model** alongside the circuit, so nobody types expected outputs by hand. Explicit `expect` values are allowed for teaching steps.
- **Setup/hold convention:** sequence authors never change data inputs in the same step as a rising clock edge (enforced by a content test). This keeps behavioural chips and player-built chips in agreement.
- **Result:** `{ passed, cases: [{ index, inputs, expected, actual, status: 'pass'|'fail'|'unstable' }], error?: 'short'|'invalid' }`.

### 4.6 Validation (before compile)

| Check                                             | Result                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| Wire references a missing component or pin        | `invalid`: dropped on load and logged                                |
| Output → output, or input → input                 | Prevented in the editor; `invalid` in the engine                     |
| Two non-relay drivers on one net                  | `short`: the wires are highlighted and testing is blocked            |
| Component kind not in this level's toolbox        | `invalid`: prevented in the editor                                   |
| An `in`/`out` pin defined by the level is missing | Impossible in practice; IO components are fixed and can't be deleted |

### 4.7 Metrics (static analysis of the player's designs)

- **Component count:** relays in Chapter 0. From Chapter 1, NAND count, calculated through nested chips using the player's **current** saved design for each chip (this resolves spec open question 2: metrics update when a chip is redesigned).
- **Delay:** the longest path in ticks through a DAG, where each NAND = 1 and each chip = that chip's own delay. Reported **only for combinational levels**; it is not meaningful for circuits with feedback (§11).
- Results are memoised per chip and invalidated when that chip's level is re-solved.

## 5. Content design

### 5.1 Level definition

```ts
interface LevelDef {
  id: '0.1' | … | '4.6';
  chapter: 0 | 1 | 2 | 3 | 4;
  title: string;
  inputs: string[];               // ordered pin names; also the truth-table column order
  outputs: string[];
  goal: Goal;
  toolbox: { include: 'unlocked' | ComponentKind[]; exclude?: ComponentKind[] };
  unlocks?: { chipId: ChipId; displayName: string; symbol?: string };
  concept: string;                // markdown, ≤150 words (lint-checked)
  hints: [string, string];
  reference: (b: CircuitBuilder) => void;   // reference solution
}
```

- **One source of truth:** a chip's pins and behaviour come from the `LevelDef` that unlocks it. `registry.ts` builds the chip catalogue from the level list.
- **Large truth tables** (3.3, 3.4) use `display: { formula: 'S = A + B + Cᵢₙ' }`. The UI shows the formula, a sample of rows (including all failing rows), and a "show all" option. Every row is still tested. (This resolves spec open question 3.)

### 5.2 Reference solutions via builder

Writing coordinates by hand for 24 circuits would be tedious, so reference solutions are written in code:

```ts
reference: (b) => {
  const n1 = b.add('nand'),
    n2 = b.add('nand');
  b.wire('A', n1.in('a'));
  b.wire('B', n1.in('b'));
  b.wire(n1.out('out'), n2.in('a'));
  b.wire(n1.out('out'), n2.in('b'));
  b.wire(n2.out('out'), 'OUT'); // AND = NOT(NAND)
};
```

The builder lays components out automatically (simple column layout), so reference solutions can also be opened in the editor, for debugging or as an optional "reveal" after solving.

## 6. Editor design

- **Coordinates:** world space in grid units (1 unit = 16 px at zoom 1). The SVG `viewBox` handles pan and zoom. Components snap to integer grid positions.
- **Interaction state machine** (one place handling pointer events): `idle → draggingComponent | drawingWire | boxSelecting | panning`. This keeps pointer logic testable and avoids scattered handlers.
- **Wires:** routed orthogonally (out → horizontal → vertical → horizontal → in) with a simple midpoint heuristic. Manual bend points are a stretch goal, and obstacle-avoiding routing is deferred.
- **Live signal display:** an ON wire is drawn thick with a glow and a solid stroke; an OFF wire is thin and dashed. This satisfies "distinguishable without colour" (spec §11) and shows up in greyscale. Signal-flow animation uses a CSS dash offset and is disabled under `prefers-reduced-motion`.
- **Undo/redo:** a history stack of Immer-produced `Circuit` snapshots, capped at 200. Every completed gesture (drop, move-end, wire-connect, delete) is one entry.
- **Chip rendering:** a rectangle with a name and labelled pins. Primitives get custom symbols (relay coil and contact, NAND shape). "Open chip" shows the player's saved design for that chip in a read-only canvas.
- **Keyboard:** Delete/Backspace, Ctrl/⌘+Z / Shift+Z, Ctrl/⌘+D (duplicate), R (rotate), Space+drag (pan), and digit keys 1–9 to toggle level inputs.

## 7. Persistence

```ts
interface SaveV1 {
  version: 1;
  progress: Record<LevelId, { solved: boolean; best?: { count: number; delay?: number } }>;
  circuits: Record<LevelId | 'sandbox', Circuit>;
  settings: {
    theme: 'system' | 'light' | 'dark';
    sound: boolean;
    reducedMotion: 'system' | boolean;
  };
}
```

- Storage key `zipzap.save`. Writes are debounced (500 ms) after every change.
- On load: parse, then validate with Zod, then run the `migrations[version]` chain up to the current version. If the data is corrupt, keep a backup copy under `zipzap.save.corrupt.<ts>` and start fresh with a notice.
- **Export** downloads `zipzap-save-YYYYMMDD.json`. **Import** uses the same validation and migration path and asks for confirmation before overwriting.

## 8. UI and screens

| Screen       | Contents                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Map**      | Chapters as rows of level nodes (locked / available / solved, with best metrics). Entry point to the Sandbox.                                                                                                             |
| **Level**    | Left: toolbox. Centre: canvas. Right: goal panel (truth table or step table), Run Tests button, results, hints. Top: title, concept-card button, metrics. A solve dialog shows metrics vs best and a "Next level" button. |
| **Sandbox**  | Canvas with every unlocked chip. The player can add free `in`/`out` pins. No goal.                                                                                                                                        |
| **Settings** | Theme, sound, motion, export/import save, reset progress (with confirmation).                                                                                                                                             |

Routing: a tiny hash-based router (`#/map`, `#/level/2.3`, `#/sandbox`). This works on any static host without server rewrites.

Visual style: clean and minimal. Light and dark themes come from CSS custom properties. The palette is checked for colour-blind safety, and ON/OFF never depends on colour alone.

## 9. Testing strategy

| Layer                   | What                                                                                                                                                                                                                                                                                                                | Tool                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Engine unit             | Each primitive; wired-OR nets; short detection; settle stability; oscillation detection; DFF edge behaviour; metrics on known circuits                                                                                                                                                                              | Vitest              |
| **Content** (key layer) | For **every** level: (a) the reference solution passes all tests; (b) the empty circuit fails; (c) the reference uses only the allowed toolbox; (d) the concept card is ≤150 words and there are 2 hints; (e) sequential sequences start with a forcing step and never change data in the same step as a clock edge | Vitest              |
| Chip consistency        | For every chip: running the **reference solution** through all input rows or sequences matches the **behavioural chip**. This proves the chip models are correct.                                                                                                                                                   | Vitest              |
| Performance             | The Tiny RAM full test suite runs in < 1 s (asserted at < 250 ms in CI for headroom)                                                                                                                                                                                                                                | Vitest              |
| Persistence             | Round-trip save; migration from a v1 fixture; a corrupt save is quarantined                                                                                                                                                                                                                                         | Vitest              |
| E2E                     | Solve 0.1 by drag-and-wire; reload restores the circuit and progress; export then import into a fresh context; unlock flow 0.4 → chapter 1                                                                                                                                                                          | Playwright          |
| Visual / a11y           | Greyscale screenshot check of ON/OFF wires; keyboard toggling of inputs; reduced-motion check                                                                                                                                                                                                                       | Playwright + manual |

Acceptance-criteria traceability is in §12.

## 10. Milestones

| #   | Milestone                       | Outcome                                                                                              | Demo                                                                 |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| M0  | **Scaffold**                    | Vite + React + TS + Vitest + Playwright + lint, CI script, folder skeleton                           | `pnpm dev` shows a placeholder; `pnpm test` is green                 |
| M1  | **Engine**                      | Model, validate, compile, simulate, testRunner, metrics, builder, all with unit tests                | Headless: build a NAND-based XOR in a test and get every row passing |
| M2  | **Content (headless)**          | All 24 levels with reference solutions and chip behaviours; content and chip-consistency tests green | The whole game is "solved" by the test suite with no UI yet          |
| M3  | **Editor core**                 | Canvas, pan/zoom, place/move/delete, wiring, live signals, undo/redo, toolbox                        | A circuit can be built and toggled live in a sandbox page            |
| M4  | **Level loop**                  | Level screen, goal table, run tests, results, solve flow, chip unlock, hints, concept cards          | Chapters 0–3 playable end to end                                     |
| M5  | **Progression and persistence** | Map, unlock rules, autosave, export/import, settings                                                 | Reload-safe progress; E2E green                                      |
| M6  | **Sequential UX**               | Step table, step scrubbing, waveform view, oscillation badge, Chapter 4                              | Tiny RAM playable                                                    |
| M7  | **Polish and release**          | Themes, a11y pass, sound, solve animation, "open chip", performance check, deploy                    | Public URL                                                           |

M1 and M2 come before any UI on purpose. They make sure every level is solvable and every rule is defined before we invest in the editor.

## 11. Spec clarifications

The details planning turned up (delay metric scope, chip timing, sequential test conventions, how relay outputs join) have been folded into `spec.md` §15 (Decisions log, items 5–8).

## 12. Acceptance-criteria traceability

| Spec AC                                                            | Verified by                                        |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| 1. New player completes 0.1 unaided                                | Manual playtest (3+ people) + E2E solve of 0.1     |
| 2. All 24 levels solvable with offered parts                       | Content tests (a) and (c)                          |
| 3. Tests accept valid and reject invalid/shorted/unstable circuits | Engine unit tests + content test (b)               |
| 4. Unlocked chips appear and behave per spec                       | Chip-consistency tests + E2E unlock flow           |
| 5. Latches/RAM work; oscillation reported, not frozen              | Engine oscillation tests + Chapter 4 content tests |
| 6. Metrics shown; bests persist                                    | Metrics unit tests + E2E reload                    |
| 7. Progress restored; export/import round-trip                     | Persistence tests + E2E                            |
| 8. ON/OFF distinguishable in greyscale                             | Playwright greyscale screenshot + manual review    |
| 9. Tiny RAM suite < 1 s                                            | Performance test                                   |

## 13. Risks

| Risk                                                                         | Mitigation                                                                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The free-canvas editor's feel (wiring, selection) takes longer than expected | Isolate it in M3 behind an interaction state machine; playtest early; keep auto-routing simple |
| Chapter 4 timing surprises (latch glitches, oscillation) confuse players     | Forcing steps, the oscillation badge, a concept card, and the step-by-step tick mode           |
| Behavioural chips diverge from player-built designs                          | Chip-consistency tests; setup/hold convention in sequences                                     |
| Difficulty spikes (XOR, the 4-bit subtractor, DFF)                           | Two-tier hints; playtest each chapter; per-level analytics (local only, could ship later)      |
| SVG performance in the later CPU phase                                       | Rendering behind a layer that can move to Canvas; only visible components rendered             |
