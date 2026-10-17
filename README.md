# Zip Zap

A browser puzzle game where you build a computer from the ground up.

Start with a handful of electromagnetic relays, discover the NAND gate, then climb through logic gates, routing, arithmetic and memory. **Every component you build becomes a chip you can reuse**, so by the end your toolbox holds a tiny RAM made from parts you built yourself.

## Status

In development. The project follows spec-driven development:

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
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
