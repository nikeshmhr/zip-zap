# Zip Zap — Tasks (MVP)

> Implements `plan.md` v0.1 / `spec.md` v0.2 · Last updated 2026-10-17

## How to use this file

- Work **in order** within a milestone. Tasks list their dependencies when they rely on more than the previous task.
- Each task is small enough for one focused session and ends with **`pnpm check` green** (typecheck + lint + unit tests).
- Each task gets **one commit** following [Conventional Commits](https://www.conventionalcommits.org/), with the task ID in the footer. Tick the box in the same commit. Example:
  ```
  feat(engine): add unit-delay simulator settle loop

  Refs: T1.6
  ```
  - Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `build`, `ci`, `perf`, `style`.
  - Scopes: `engine`, `content`, `editor`, `ui`, `state`, `persistence`, `specs`, `deps`. Omit the scope for repo-wide changes.
- **Done when** is the definition of done. If a task turns out to need a spec or plan change, update those files first, in the same commit.
- _(optional)_ marks a spec "Should/Could" item that can slip without blocking the MVP.

---

## M0: Scaffold

- [x] **T0.1 Repo setup** · `git init`, `.gitignore`, `README.md` (pitch + links to `specs/`)
  - Done when: first commit contains `specs/` and the README.
- [x] **T0.2 App scaffold** · Vite + React + TypeScript (strict; pinned to 6.0.x because typescript-eslint doesn't support TS 7 yet) with pnpm; folder skeleton from plan §3 (`engine/ content/ state/ persistence/ ui/ app/`)
  - Done when: `pnpm dev` serves a "Zip Zap" placeholder page and `pnpm build` succeeds.
- [x] **T0.3 Lint and format** · ESLint (incl. a rule that `engine/` may not import from `ui/`, `state/` or React) + Prettier; `lint`, `format`, `typecheck` scripts
  - Done when: an engine file that imports React fails lint.
- [x] **T0.4 Unit tests** · Vitest configured; one sample test; `pnpm check` = typecheck + lint + test
  - Done when: `pnpm check` passes.
- [x] **T0.5 E2E tests** · Playwright configured against the dev server; smoke test loads the placeholder
  - Done when: `pnpm e2e` passes.

## M1: Engine (headless)

- [x] **T1.1 Model types** · `Circuit`, `ComponentInstance`, `Wire`, `PinRef`, `ComponentKind`, `Bits` helpers (plan §4.1)
  - Done when: the types compile, and the helpers (bits ↔ number, row enumeration) have tests.
- [ ] **T1.2 Primitives** · `ComponentDef` interface; `nand`, `relayNO`, `relayNC`, `power`, `const0/1`, `in`, `out` (plan §4.2)
  - Done when: each primitive's `step` is tested against its truth table.
- [ ] **T1.3 Circuit builder** · code-first API (`b.add`, `b.wire`, named IO pins) with automatic column layout (plan §5.2)
  - Done when: a builder-made XOR-from-NAND produces a valid `Circuit` with non-overlapping positions.
- [ ] **T1.4 Validation** · dangling refs, wrong direction, one wire per input, relay wired-OR vs **short**, toolbox check (plan §4.6) · deps T1.3
  - Done when: tests cover each rule, including "two relay outputs into one input = join" and "two NAND outputs into one input = short".
- [ ] **T1.5 Compile to netlist** · nets, drivers, readers, wired-OR merge, flat typed arrays (plan §4.3)
  - Done when: tests check the net structure for a fan-out circuit and a wired-OR circuit.
- [ ] **T1.6 Simulator** · synchronous unit-delay `settle`, dirty tracking, `maxTicks`, STABLE/UNSTABLE, reset (plan §4.4)
  - Done when the tests show:
    - a chain of 3 NOTs stabilises in 3 ticks;
    - XOR from NAND is correct for all rows;
    - a ring oscillator (1 NAND looped back to itself) returns UNSTABLE;
    - a NOR SR latch settles after a forcing step and then holds its state.
- [ ] **T1.7 Behavioural chips** · `ChipDef`; adapters for combinational (truth function) and sequential (state machine) chips (plan §4.2)
  - Done when: a behavioural DFF updates only on the rising CLK edge, and a combinational chip has a 1-tick delay.
- [ ] **T1.8 Test runner: combinational** · enumerate 2ⁿ rows; results with pass/fail/unstable; short/invalid short-circuit the run (plan §4.5)
  - Done when: a correct XOR passes, a wrong one reports the exact failing rows, and a shorted circuit returns `error: 'short'`.
- [ ] **T1.9 Test runner: sequential** · step sequences, reset per sequence, expected values from the reference model (plan §4.5)
  - Done when: a correct D latch passes; a "latch" missing its feedback wire fails at the first hold step.
- [ ] **T1.10 Metrics** · relay/NAND count through nested chips; delay as the longest DAG path; skip delay for cyclic circuits; memoisation (plan §4.7)
  - Done when: hand-computed counts and delays match for NOT, XOR, Full Adder (built from chips) and an SR latch (count only).

## M2: Content (headless)

- [ ] **T2.1 Level schema and registry** · `LevelDef`, ordered level list, chip catalogue built from levels, toolbox resolution (`'unlocked'` + include/exclude), unlock graph (plan §5.1)
  - Done when: registry tests resolve the toolbox correctly for a stub 3-level set.
- [ ] **T2.2 Content test harness** · generic tests that run over **every** registered level (plan §9):
  - (a) the reference solution passes;
  - (b) the empty circuit fails;
  - (c) the reference uses only the toolbox;
  - (d) the concept card is ≤150 words and there are 2 hints;
  - (e) sequential sequences start with a forcing step and keep the setup/hold rule.

  Also add a **chip-consistency** test (the reference solution vs the behavioural chip).
  - Done when: the harness runs green over the stub levels.

- [ ] **T2.3 Chapter 0: Switches** · 0.1–0.4 with reference solutions, concept cards, hints
  - Done when: the content tests pass; the NAND chip is unlocked by 0.4; relays are excluded from Chapter 1 onward.
- [ ] **T2.4 Chapter 1: Gates** · 1.1–1.6
  - Done when: the content and chip-consistency tests pass.
- [ ] **T2.5 Chapter 2: Routing** · 2.1–2.4
  - Done when: the content and chip-consistency tests pass.
- [ ] **T2.6 Chapter 3: Arithmetic** · 3.1–3.4, formula display for 3.3/3.4
  - Done when: the content and chip-consistency tests pass; the subtractor reference uses Adder4 with C_in = 1.
- [ ] **T2.7 Chapter 4: Memory** · 4.1–4.6 with step sequences
  - Done when: the content and chip-consistency tests pass for all six, including Tiny RAM.
- [ ] **T2.8 Performance test** · the Tiny RAM full suite is timed in a test
  - Done when: it is asserted < 250 ms (spec AC 9).

**🎯 Milestone check:** all 24 levels are proven solvable headlessly.

## M3: Editor core

- [ ] **T3.1 App shell** · hash router (`#/map`, `#/level/:id`, `#/sandbox`, `#/settings`), CSS-variable theming (light/dark/system), screen placeholders
  - Done when: navigating between routes works and the theme follows the OS setting.
- [ ] **T3.2 Editor store** · Zustand + Immer: circuit, selection, history (cap 200, one entry per gesture) (plan §6)
  - Done when: store tests cover add/move/delete/wire plus undo/redo.
- [ ] **T3.3 Canvas** · SVG viewBox pan/zoom, dot grid, world ↔ screen coordinate utilities
  - Done when: the coordinate utilities are unit-tested; wheel-zoom keeps the point under the cursor fixed.
- [ ] **T3.4 Component rendering** · relay and NAND symbols, chip boxes with labelled pins, IO switches and lamps fixed at the canvas edges, rotation
  - Done when: a visual check page renders every component kind.
- [ ] **T3.5 Interaction state machine** · idle / dragging / wiring / box-select / panning; place from toolbox, move with snapping, multi-select, delete
  - Done when: the state machine has unit tests, and manual use feels smooth.
- [ ] **T3.6 Wiring** · drag pin → pin, direction rules, one wire per input, relay junction join with a dot, orthogonal routing, select/delete wire · deps T1.4
  - Done when: invalid connections are refused with a visible cue, and a relay join shows a junction dot.
- [ ] **T3.7 Live simulation** · recompile on change, toggle inputs, ON = thick solid glow / OFF = thin dashed, flow animation (off under reduced motion), oscillating badge, short highlighting · deps T1.6
  - Done when: toggling inputs on a NAND circuit updates the wires live; a ring oscillator shows the badge without freezing.
- [ ] **T3.8 Toolbox panel** · lists the resolved toolbox for the current context, with drag-to-place
  - Done when: the panel shows exactly the components the level allows.
- [ ] **T3.9 Keyboard shortcuts** · delete, undo/redo, duplicate, rotate, space-pan, digits toggle inputs
  - Done when: every shortcut works and is listed in a help popover.

## M4: Level loop

- [ ] **T4.1 Level screen layout** · toolbox / canvas / goal panel / top bar; loads `LevelDef` by route
  - Done when: `#/level/1.3` shows the OR level with its IO pins placed.
- [ ] **T4.2 Goal panel: truth table** · full table, or formula + sample rows for large levels
  - Done when: 1.5 shows 4 rows; 3.3 shows the formula with samples and a "show all" option.
- [ ] **T4.3 Run tests and results** · results mapped onto the table rows; clicking a failing row sets those inputs on the canvas
  - Done when: a wrong XOR highlights exactly the failing rows, and clicking one reproduces it live.
- [ ] **T4.4 Blocked-run feedback** · short/invalid circuits block the run with a clear message and highlight the offending wires
  - Done when: an attempted run with two NAND outputs joined shows the short message and highlight.
- [ ] **T4.5 Solve flow** · metrics vs best, solve dialog, chip unlock toast, "Next level"
  - Done when: solving 0.4 unlocks NAND and opens 1.1.
- [ ] **T4.6 Concept cards and hints** · markdown modal on first open (re-openable); 2-step hint reveal
  - Done when: the concept card appears on first visit only, and hints reveal in order.
- [ ] **T4.7 E2E: first level** · Playwright drags parts, wires them, runs tests and solves 0.1
  - Done when: `pnpm e2e` passes (spec AC 1, automated half).

## M5: Progression and persistence

- [ ] **T5.1 Progress store and unlock rules** · solved/bests per level; in-chapter ordering; chapter gating
  - Done when: the unit tests for the unlock rules pass.
- [ ] **T5.2 Save schema** · Zod `SaveV1`, migration chain, corrupt-save quarantine (plan §7)
  - Done when: tests cover a round-trip, a v1 fixture migration, and a corrupt-save backup.
- [ ] **T5.3 Autosave and load** · debounced 500 ms writes; per-level circuits restored on open
  - Done when: a manual reload mid-level restores the exact circuit.
- [ ] **T5.4 Map screen** · chapters × level nodes (locked/available/solved + bests); entry point to the Sandbox
  - Done when: the map reflects progress, and locked levels can't be opened from the URL either.
- [ ] **T5.5 Settings screen** · theme, sound, motion, export/import (with confirmation), reset progress (with confirmation)
  - Done when: export, then import into a cleared browser, restores everything.
- [ ] **T5.6 Sandbox** · every unlocked chip, free IO pins, no goal, persisted
  - Done when: the player can build freely with unlocked chips, and the circuit survives a reload.
- [ ] **T5.7 E2E: persistence** · reload restores progress and circuits; export → import round-trip; unlock 0.4 → chapter 1
  - Done when: `pnpm e2e` passes (spec AC 4, 6, 7).

## M6: Sequential UX

- [ ] **T6.1 Step table goal panel** · steps × pins with the CLK edge marked
  - Done when: the D Latch and DFF goals render clearly.
- [ ] **T6.2 Step scrubbing** · results jump to the first failing step; scrubbing replays the circuit to any step
  - Done when: a broken DFF shows the failing step and the canvas state at that step.
- [ ] **T6.3 Waveform view** _(Should)_ · timing diagram of all IO pins over the steps, expected vs actual
  - Done when: the waveform renders for 4.x levels, with mismatches highlighted.
- [ ] **T6.4 Tick-by-tick mode** _(Should)_ · advance one tick at a time; shows propagation and oscillation
  - Done when: a player can watch an SR latch settle tick by tick.
- [ ] **T6.5 Chapter 4 playthrough** · manually solve 4.1–4.6 in the UI and fix any friction
  - Done when: Tiny RAM is solved in the UI (spec AC 5).

## M7: Polish and release

- [ ] **T7.1 Open-chip view** _(Should)_ · read-only canvas showing the player's design inside any unlocked chip
  - Done when: opening Full Adder from the toolbox shows the player's design.
- [ ] **T7.2 Feel** · solve animation, optional sounds (relay click, solve chime) respecting settings
  - Done when: the effects play, and none play when sound or motion is turned off.
- [ ] **T7.3 Accessibility pass** · focus order, keyboard toggles, colour-blind-safe palette check, Playwright greyscale ON/OFF screenshot test
  - Done when: the greyscale test passes (spec AC 8) and a keyboard-only player can toggle inputs and run tests.
- [ ] **T7.4 Wire bend points** _(optional)_ · manual bends on wires
  - Done when: the player can add and drag bend points on a wire.
- [ ] **T7.5 Performance and bundle check** · profile a large Tiny RAM circuit while editing; check bundle size
  - Done when: editing stays at 60 fps and the initial load is < 300 KB gzipped.
- [ ] **T7.6 Playtest** · 3+ people, untouched, from 0.1 onward; record where they get stuck; fix or adjust hints
  - Done when: everyone completes 0.1 unaided (spec AC 1), and the fixes are logged and applied.
- [ ] **T7.7 Release** · deploy the static build (GitHub Pages / Netlify / Vercel); README with the link and how to play
  - Done when: a public URL plays the full MVP.

---

## Post-MVP backlog (from spec §13)

Not scheduled. Each phase gets its own spec → plan → tasks cycle.

- Buses, splitters and joiners; 8-bit arithmetic
- ALU with flags
- CPU parts: program counter, instruction register, control unit, larger RAM
- The machine: instruction set, assembly editor, running programs on the player's own CPU
