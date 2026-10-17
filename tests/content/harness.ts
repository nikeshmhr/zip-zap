/**
 * Generic checks that every level must pass (plan §9, spec AC 2–4). Run over the real
 * catalogue in levels.test.ts and over a stub catalogue in harness.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { Catalogue } from '../../src/content/registry.ts';
import type { LevelDef } from '../../src/content/types.ts';
import { buildCircuit, emptyCircuit } from '../../src/engine/builder.ts';
import { computeMetrics } from '../../src/engine/metrics.ts';
import type { Bits, Circuit } from '../../src/engine/model.ts';
import { chipIdOf, isChipKind } from '../../src/engine/model.ts';
import type { TestReport } from '../../src/engine/testRunner.ts';
import { runTests } from '../../src/engine/testRunner.ts';
import { validate } from '../../src/engine/validate.ts';

export const MAX_CONCEPT_WORDS = 150;
/** Truth tables larger than this must be shown as a formula (spec §15.3). */
export const MAX_TABLE_INPUTS = 4;

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Readable summary of the first failing cases, for assertion messages. */
export function describeFailures(report: TestReport, limit = 3): string {
  if (report.error) return `${report.error}: ${report.issues.map((i) => i.message).join('; ')}`;
  return report.cases
    .filter((c) => c.status !== 'pass')
    .slice(0, limit)
    .map(
      (c) =>
        `#${c.index}${c.sequence === undefined ? '' : ` (seq ${c.sequence} step ${c.step})`} ` +
        `${c.status}: in ${JSON.stringify(c.inputs)} expected ${JSON.stringify(c.expected)} ` +
        `got ${JSON.stringify(c.actual)}`,
    )
    .join('\n');
}

/** Problems with a sequential level's step sequences (spec §15.7); empty if fine. */
export function sequenceProblems(level: LevelDef): string[] {
  const { goal, clock, inputs } = level;
  if (goal.kind !== 'sequential') return [];
  const problems: string[] = [];
  goal.sequences.forEach((steps, s) => {
    const first = steps[0];
    const missing = inputs.filter((name) => first?.set[name] === undefined);
    if (missing.length > 0) {
      problems.push(`sequence ${s} step 0 must set every input (missing ${missing.join(', ')})`);
    }
    if (!clock) return;
    const current: Bits = Object.fromEntries(inputs.map((n) => [n, 0]));
    steps.forEach((step, i) => {
      const changed = Object.entries(step.set).filter(
        ([name, value]) => value !== undefined && current[name] !== value,
      );
      const clockChanged = changed.some(([name]) => name === clock.pin);
      if (clockChanged && changed.length > 1) {
        problems.push(`sequence ${s} step ${i} changes ${clock.pin} together with other inputs`);
      }
      const high = current[clock.pin] === 1;
      for (const [name] of changed) {
        if (high && clock.holdWhileHigh?.includes(name)) {
          problems.push(`sequence ${s} step ${i} changes ${name} while ${clock.pin} is high`);
        }
      }
      for (const [name, value] of changed) current[name] = value!;
    });
  });
  return problems;
}

export function contentSuite(name: string, catalogue: Catalogue) {
  const references = new Map<string, Circuit>();
  for (const level of catalogue.levels)
    references.set(level.id, catalogue.referenceCircuit(level.id));
  /** Reference designs stand in for the player's designs when computing metrics. */
  const chipDesigns = new Map<string, Circuit>();
  for (const level of catalogue.levels) {
    const kind = level.unlocks?.kind;
    if (kind && isChipKind(kind)) chipDesigns.set(chipIdOf(kind), references.get(level.id)!);
  }

  describe(`${name}: every level`, () => {
    describe.each(catalogue.levels.map((l) => [`${l.id} ${l.title}`, l] as const))(
      '%s',
      (_, level) => {
        const spec = catalogue.testSpec(level.id);
        const options = catalogue.validateOptions(level.id);
        const reference = references.get(level.id)!;

        it('(a) the reference solution passes every test', () => {
          const report = runTests(reference, catalogue.resolve, spec, options);
          expect(report.passed, describeFailures(report)).toBe(true);
          expect(report.cases.length).toBeGreaterThan(0);
        });

        it('(b) the empty circuit fails', () => {
          const report = runTests(emptyCircuit(level), catalogue.resolve, spec, options);
          expect(report.passed).toBe(false);
        });

        it('(c) the reference uses only the toolbox and allowed wiring', () => {
          const validation = validate(reference, catalogue.resolve, options);
          expect(validation.issues).toEqual([]);
        });

        it('(d) has a summary, a short concept card and two distinct hints', () => {
          expect(level.summary.trim()).not.toBe('');
          expect(wordCount(level.concept)).toBeGreaterThan(0);
          expect(wordCount(level.concept)).toBeLessThanOrEqual(MAX_CONCEPT_WORDS);
          expect(level.hints).toHaveLength(2);
          expect(level.hints.every((h) => h.trim() !== '')).toBe(true);
          expect(level.hints[0]).not.toBe(level.hints[1]);
        });

        it('(e) sequences follow the forcing and clock rules', () => {
          expect(sequenceProblems(level)).toEqual([]);
          expect(level.goal.kind === 'sequential' || !level.clock).toBe(true);
        });

        it('shows large truth tables as a formula', () => {
          const goal = level.goal;
          if (goal.kind !== 'combinational' || level.inputs.length <= MAX_TABLE_INPUTS) return;
          expect(goal.display, 'needs display: { formula }').toMatchObject({
            formula: expect.any(String),
          });
        });

        it('reports metrics for the reference (delay for combinational levels)', () => {
          const metrics = computeMetrics(reference, catalogue.resolve, (id) => chipDesigns.get(id));
          expect(metrics).not.toBeNull();
          if (level.goal.kind === 'combinational') expect(metrics!.delay).toBeTypeOf('number');
        });

        const unlock = level.unlocks?.kind;
        if (unlock && isChipKind(unlock)) {
          it('chip consistency: the behavioural chip alone passes its own level', () => {
            const chipOnly = buildCircuit(
              level,
              (b) => {
                const chip = b.add(unlock);
                for (const pin of level.inputs) b.wire(pin, chip.in(pin));
                for (const pin of level.outputs) b.wire(chip.out(pin), pin);
              },
              catalogue.resolve,
            );
            const report = runTests(chipOnly, catalogue.resolve, spec);
            expect(report.passed, describeFailures(report)).toBe(true);
          });
        }
      },
    );
  });
}
