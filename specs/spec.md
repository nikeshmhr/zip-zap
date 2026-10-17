# Zip Zap — Product Spec (MVP)

> Status: **Approved v0.2** · Last updated 2026-10-17
>
> This document describes **what** the game is and **why**. Technology and architecture belong in `plan.md`.

---

## 1. Vision

A browser puzzle game where players build a computer from the ground up. They start with a handful of electromagnetic relays, discover the NAND gate, and climb through logic gates, routing, arithmetic, and memory. **Every component the player builds becomes a chip they can reuse**, so by the end of the MVP their toolbox contains RAM they built themselves, from parts they built themselves.

The long-term goal (post-MVP) is to continue the same climb into a working CPU that the player programs.

### Why this game

- **Learning comes from the mechanic.** You learn how a computer works by building one, not by answering quiz questions.
- **The progression is earned.** Each chip is something the player built and understands.
- **It's an open question for most adults.** Many people use computers every day without knowing how a pile of switches can add numbers or remember things. This game answers that question.

## 2. Target players

- **Primary:** curious adults and older teens who enjoy logic puzzles (players of Zachtronics games, nandgame or Baba Is You). No prior electronics or CS knowledge is assumed.
- **Secondary:** CS or engineering students who want an intuitive companion to a digital logic course.
- **Platform:** desktop web browser (mouse + keyboard). Tablets are a "should work"; phones are out of scope for the MVP.

## 3. Design pillars

1. **Build it, then own it.** Solving a level adds that component to the toolbox as a reusable chip.
2. **Show, don't tell.** Signals flow visibly through wires. The player learns by toggling inputs and watching what happens.
3. **Fair puzzles.** Every goal is stated exactly (a truth table or a timed sequence), and failures show exactly which case broke.
4. **Depth for those who want it.** Any solution passes. Optimization metrics are there for players who want to go further.
5. **Clean and calm.** Minimal, elegant presentation with no story and no timers. Concept cards add context without getting in the way.

## 4. Core loop

1. **Open a level.** Read a short concept card and the goal (a truth table or test sequence).
2. **Build.** Place components from the toolbox onto a free canvas and wire pins together.
3. **Experiment.** Toggle the level's inputs by hand and watch signals propagate live.
4. **Verify.** Run the test suite. Each case passes or fails visibly, and the player can jump to any failing case to see the circuit in that state.
5. **Solve.** On success, see the metrics (component count, delay) next to the player's personal best. The new chip unlocks.
6. **Move on.** Continue to the next level, or optimize this one.

## 5. Simulation rules (player-facing behaviour)

These rules define how the circuit behaves from the player's point of view. They must hold no matter how the game is implemented.

### 5.1 Signals

- Every wire carries **ON (1)** or **OFF (0)**. A wire with no driver is OFF.
- Wires connect **output pins to input pins**. One output can feed any number of inputs.
- Each input pin accepts **at most one** wire. An unconnected input reads OFF.

### 5.2 Relay chapter (Chapter 0 only)

- **Power** is a source that is always ON.
- A **Normally-Open (NO) relay** has pins `coil`, `in`, `out`: `out = in AND coil`.
- A **Normally-Closed (NC) relay** has pins `coil`, `in`, `out`: `out = in AND NOT coil`.
- **Joining:** relay outputs may be wired together onto a single net, by wiring each to the same input; a junction dot shows the join (§15.8). The net is ON if **any** joined output is ON. This is how current behaves when paths run in parallel, and it is how the player discovers OR-like and NAND behaviour.
- Joining is allowed **only between relay outputs**. Any net driven by a gate or chip output must have exactly one driver. Connecting two such outputs is flagged as a **short** and blocks testing.

### 5.3 Time and feedback

- Every component, including a chip, takes **one tick** to respond in the simulation (§15.6). A chip's _delay metric_ is the length of the longest path through the player's design inside it.
- Feedback loops (an output wired back into an earlier input) are **allowed**. They are how memory works.
- After inputs change, the circuit runs until it is **stable**. If it never settles within a bounded number of ticks, it is reported as **unstable (oscillating)**. That counts as a test failure and is shown visibly.

### 5.4 Chips

- When a level is solved, its circuit becomes a **chip**: a box whose pins are the level's inputs and outputs.
- In later levels, a chip behaves **exactly according to its level's specification**, not the player's specific design. This means a player can redesign an old chip without breaking later levels.
- The player can **open any unlocked chip** to view (and re-edit, by revisiting the level) their own design.
- A chip's **NAND count** and **delay** are calculated from the player's own design, counted down through every nested chip.

## 6. Levels (MVP content)

Each level defines its inputs, its outputs, its goal, which components are available, and the chip it unlocks. "Toolbox" means every chip unlocked so far, unless the level restricts it.

### Chapter 0: Switches

| #   | Level        | Goal                                                                       | Available           | Unlocks  |
| --- | ------------ | -------------------------------------------------------------------------- | ------------------- | -------- |
| 0.1 | **Relay**    | `OUT = A`, but A can only drive a relay coil (intro to placing and wiring) | Power, NO relay     | —        |
| 0.2 | **Series**   | `OUT = A AND B`                                                            | Power, NO relay     | —        |
| 0.3 | **Inverter** | `OUT = NOT A`                                                              | Power, NO, NC relay | —        |
| 0.4 | **NAND**     | `OUT = NOT (A AND B)`                                                      | Power, NO, NC relay | **NAND** |

After 0.4, relays leave the toolbox. A concept card explains that NAND is **universal**: everything else can be built from it.

### Chapter 1: Gates

| #   | Level    | Goal                            | Unlocks |
| --- | -------- | ------------------------------- | ------- |
| 1.1 | **NOT**  | Invert A using only NAND        | NOT     |
| 1.2 | **AND**  |                                 | AND     |
| 1.3 | **OR**   |                                 | OR      |
| 1.4 | **NOR**  |                                 | NOR     |
| 1.5 | **XOR**  | ON when exactly one input is ON | XOR     |
| 1.6 | **XNOR** | ON when the inputs are equal    | XNOR    |

Constant **0** and **1** sources are available from Chapter 1 onward.

### Chapter 2: Routing

| #   | Level         | Goal                                                                  | Unlocks     |
| --- | ------------- | --------------------------------------------------------------------- | ----------- |
| 2.1 | **Mux**       | `OUT = SEL ? B : A`                                                   | Mux         |
| 2.2 | **Demux**     | Send IN to `A` when SEL=0, to `B` when SEL=1; the other output is OFF | Demux       |
| 2.3 | **Decoder**   | 2 address bits → exactly one of 4 outputs ON                          | Decoder 2→4 |
| 2.4 | **4-way Mux** | Pick one of 4 inputs using 2 select bits                              | Mux4        |

### Chapter 3: Arithmetic

| #   | Level                | Goal                                                      | Unlocks    |
| --- | -------------------- | --------------------------------------------------------- | ---------- |
| 3.1 | **Half Adder**       | `SUM`, `CARRY` of A + B                                   | Half Adder |
| 3.2 | **Full Adder**       | A + B + C_in → `SUM`, `C_out`                             | Full Adder |
| 3.3 | **4-bit Adder**      | A[0..3] + B[0..3] + C_in → S[0..3], C_out                 | Adder4     |
| 3.4 | **4-bit Subtractor** | A − B in two's complement. Aha: invert B and set C_in = 1 | Sub4       |

Concept cards introduce binary numbers (3.1) and negative numbers / two's complement (3.4).

### Chapter 4: Memory

These are **sequential** levels: each test is a timed sequence of steps, not a single truth table.

| #   | Level                     | Goal                                                                                       | Unlocks   |
| --- | ------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 4.1 | **SR Latch**              | Set makes Q ON, Reset makes Q OFF, neither keeps Q unchanged                               | SR Latch  |
| 4.2 | **D Latch**               | While EN is ON, Q follows D; while EN is OFF, Q holds                                      | D Latch   |
| 4.3 | **D Flip-Flop**           | Q takes D's value only on the **rising edge** of CLK                                       | DFF       |
| 4.4 | **1-bit Register**        | On a clock edge, store D only if LOAD is ON; otherwise keep the old value                  | Register  |
| 4.5 | **4-bit Register**        | Same, for 4 bits                                                                           | Register4 |
| 4.6 | **Tiny RAM** _(capstone)_ | 4 words × 4 bits. Inputs ADDR[0..1], D[0..3], LOAD, CLK; output Q[0..3] = the word at ADDR | RAM 4×4   |

Concept cards introduce feedback (4.1), the clock (4.3) and addressing (4.6).

**Total: 24 levels.**

## 7. Level goals and testing

### 7.1 Combinational levels (Chapters 0–3)

- The goal is shown as a **truth table**. For levels with more than about 16 rows (for example the 4-bit adder), show a scrollable or paged table and allow sample-based display, while still testing **every** row.
- Running tests evaluates every row. Each row shows pass/fail, and failing rows display both the expected and the actual outputs.

### 7.2 Sequential levels (Chapter 4)

- The goal is shown as a **step table**. Each step sets inputs (including CLK) and lists the expected outputs after the circuit stabilises.
- Tests run from a defined reset state. Each sequence begins with a forcing step, and data inputs never change in the same step as a rising clock edge (§15.7). Failure shows the first failing step, and the player can scrub through the steps to inspect the circuit at each one.
- A **timing view** (a waveform showing each pin over the steps) **should** be available for these levels.

### 7.3 Solved state

- A level is solved when every test passes, with no shorts and no unstable cases.
- Solving unlocks the chip and the next level. Levels within a chapter unlock in order. A chapter unlocks when the previous chapter is complete.

## 8. Editor requirements

| Priority | Requirement                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------- |
| Must     | Free canvas with pan and zoom; components snap to a grid                                          |
| Must     | Drag components from the toolbox onto the canvas; move, delete, and multi-select them             |
| Must     | Draw a wire by dragging from one pin to another; delete wires; wires show their ON/OFF state live |
| Must     | Level inputs appear as toggle switches and outputs appear as lamps, all fixed at the canvas edges |
| Must     | Undo / redo                                                                                       |
| Must     | Invalid actions (a second wire into an input, a short) are prevented or clearly flagged           |
| Must     | Pin labels visible on hover, and always visible on chips                                          |
| Should   | Keyboard shortcuts (delete, undo/redo, duplicate, rotate/flip)                                    |
| Should   | Wire auto-routing that avoids passing through components, or manual bend points                   |
| Should   | "Open chip" view showing the player's design inside any unlocked chip (read-only)                 |
| Should   | Step-by-step mode: advance one tick at a time to watch propagation                                |
| Could    | Copy/paste between levels                                                                         |
| Could    | Comments or labels on the canvas                                                                  |

## 9. Progression, metrics and hints

- **Progress map:** chapters shown as a path of levels with locked, available and solved states.
- **Metrics per solved level:** component count (relays in Ch 0, NAND count from Ch 1 on, calculated through nested chips) and **delay** in ticks (Chapters 0–3 only; see §15.5). The player's best for each is stored and shown.
- **Hints:** each level has up to **2 progressive hints**: a nudge first, then a strong hint. Hints never show the full solution.
- **Concept cards:** a short explanation (under 150 words, optionally with a small diagram) shown when a level opens and available again later. Chapters 0, 3 and 4 introduce real-world context (relay computers, binary, why memory needs feedback).
- **Sandbox:** a free-build mode using every unlocked chip, with manual inputs and outputs and no goal.

## 10. Persistence

- Progress is saved automatically in the browser: the circuit for each level, solved status and best metrics.
- The player can **export and import** their save as a file, to back it up or move it between browsers.
- No accounts and no server in the MVP.

## 11. Accessibility and feel

- ON/OFF must be distinguishable **without colour alone** (for example wire thickness or a glow, plus a pattern), and the palette must be safe for colour-blind players.
- Respect the reduced-motion setting: no animated signal flow, only an instant state change.
- Level inputs can be toggled from the keyboard.
- Light and dark themes.
- Short, satisfying feedback on solve (a subtle animation, optional sound). Relays **could** make a click sound.

## 12. Non-goals (MVP)

- Multi-bit **buses** and splitters (planned for the CPU phase)
- CPU, ALU, assembly programming (post-MVP; see §13)
- Accounts, cloud saves, leaderboards, social features
- Phone layouts
- Analog electronics or real transistor physics (relays are an idealised digital switch)
- User-created level sharing

## 13. Future direction (constrains MVP design)

The planned next phases are:

1. **Buses and wider data:** 8-bit buses with splitters and joiners; an 8-bit adder, comparator and incrementer.
2. **ALU:** selectable operations (add, subtract, AND, OR, compare) with flags (zero, negative, carry).
3. **CPU parts:** program counter, instruction register, larger RAM, an instruction decoder or control unit.
4. **The machine:** a complete CPU built by the player, a simple instruction set, and an in-game assembly editor where the player writes and runs programs on their own machine.

**The MVP must therefore:**

- Represent chips so they can nest to arbitrary depth.
- Define levels as **data** (pins, tests, toolbox, unlocks), so new chapters can be added without changing the engine.
- Keep the simulation fast enough to scale from tens of components (MVP) to thousands (CPU phase).
- Store saves in a versioned format that future releases can migrate.

## 14. Acceptance criteria (MVP)

1. A new player can open the game in a desktop browser and complete level 0.1 without outside help.
2. All 24 levels are playable and solvable using only the components that level offers. Each has at least one reference solution, verified by automated tests.
3. Every level's test suite correctly accepts valid solutions and rejects circuits that are incorrect, shorted or unstable.
4. Solving a level unlocks its chip, which then appears in the toolbox for later levels and behaves according to its level's specification.
5. A correct SR latch, D flip-flop and Tiny RAM work using feedback loops, and an oscillating circuit is reported as unstable rather than freezing the game.
6. Metrics (component count, delay) are shown on solve and personal bests persist across reloads.
7. Closing and reopening the browser restores all progress and every in-progress circuit. Export followed by import into a fresh browser restores the same state.
8. ON/OFF wires are distinguishable in a greyscale screenshot.
9. Running the full Tiny RAM test suite completes in under 1 second on a typical laptop.

## 15. Decisions log

Resolved questions, kept here for reference.

1. **Name:** _Zip Zap_.
2. **Re-solving:** if a player redesigns an old chip, metrics in later levels update automatically, because they are calculated from the current design.
3. **Large truth tables** (3.3, 3.4: 512 and 256 rows): show the goal as arithmetic (for example "S = A + B + Cᵢₙ") plus a sample table that always includes any failing rows, with a "show all" option. Every row is still tested.
4. **Tablets:** touch input is best-effort for the MVP.
5. **Delay metric:** reported only for combinational levels (Chapters 0–3), because it isn't meaningful for circuits with feedback.
6. **Chip timing:** a chip used in a later level takes 1 tick to respond, whatever its internal depth. Its logic is exact; its internal timing is abstracted.
7. **Sequential tests** start with a forcing step that puts the circuit in a known state, and never change data inputs in the same step as a rising clock edge (the game's version of setup/hold time).
8. **Joining relay outputs:** done by wiring a second relay output into an input that already has a relay-driven wire. A junction dot appears. This is the only case where an input accepts more than one wire.
