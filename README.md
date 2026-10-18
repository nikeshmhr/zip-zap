# Zip Zap

A browser puzzle game where you build a computer from the ground up.

**▶ Play it: https://nikeshmhr.github.io/zip-zap/**

Start with a handful of electromagnetic relays, discover the NAND gate, then climb through logic gates, routing, arithmetic and memory. **Every component you build becomes a chip you can reuse**, so by the end your toolbox holds a tiny RAM made from parts you built yourself.

## Playing

24 levels in five chapters: **Switches** (relays to NAND), **Gates**, **Routing**, **Arithmetic** and **Memory** (latches, flip-flops, registers and a 4×4 RAM).

- Drag parts from the toolbox onto the canvas, or click to add them. Drag from pin to pin to wire them.
- Flip the input switches (click them, or press 1–9) and watch signals flow. **Run tests** checks every case and shows which rows or steps fail.
- Solving a level turns your circuit into a chip for the next ones. Double-click any chip to look inside your own design.
- Memory levels show their goal as steps over time: click a step (or a point on the Timing view) to see the circuit as the test saw it. **Tick by tick** slows everything down to one gate delay per click.
- Press <kbd>?</kbd> in the editor for every shortcut. Progress saves in your browser; export a backup from Settings.

## Status

MVP released on GitHub Pages; the human playtest (T7.6) is next. See `specs/tasks.md`. The project follows spec-driven development:

| Document                           | What it covers                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| [`specs/spec.md`](specs/spec.md)   | **What** the game is and why: players, mechanics, levels, acceptance criteria |
| [`specs/plan.md`](specs/plan.md)   | **How** it's built: stack, architecture, engine design, testing               |
| [`specs/tasks.md`](specs/tasks.md) | Ordered implementation tasks with a "done when" check for each                |

## Development

Requires Node 24+ and pnpm.

```sh
pnpm install
pnpm dev        # start the dev server
pnpm build      # typecheck and build to dist/
pnpm lint       # ESLint, including layer-boundary rules
pnpm format     # Prettier
pnpm test       # unit tests (Vitest)
pnpm check      # typecheck + lint + format check + unit tests
pnpm e2e        # browser tests (Playwright; first run: pnpm exec playwright install chromium)
pnpm size       # build and check the gzipped bundle stays under 300 KB
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## Deploying

Every push to `main` is checked, built and published to GitHub Pages by `.github/workflows/deploy.yml` (the repo's Pages source must be set to **GitHub Actions**).

`pnpm build` writes a static site to `dist/`. It uses relative paths and hash-based routes (`#/level/1.3`), so it works from any folder on any static host (GitHub Pages, Netlify, Vercel, an S3 bucket…) with no server configuration. Development-only test hooks are not included in the build.
