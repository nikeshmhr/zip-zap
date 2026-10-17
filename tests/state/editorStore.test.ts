import { describe, expect, it } from 'vitest';
import { startCircuit } from '../../src/state/editing.ts';
import { createEditorStore, HISTORY_LIMIT } from '../../src/state/editorStore.ts';

const io = { inputs: ['A'], outputs: ['OUT'] };
const make = () => createEditorStore(startCircuit(io));

describe('editor store', () => {
  it('adds a part, selects it, and undoes/redoes the add', () => {
    const store = make();
    const id = store.getState().addPart('nand', { x: 10, y: 0 });
    expect(store.getState().selection.components).toEqual([id]);
    expect(store.getState().circuit.components).toHaveLength(3);

    store.getState().undo();
    expect(store.getState().circuit.components).toHaveLength(2);
    expect(store.getState().selection.components).toEqual([]); // pruned

    store.getState().redo();
    expect(store.getState().circuit.components).toHaveLength(3);
  });

  it('records a whole drag gesture as one history entry', () => {
    const store = make();
    store.getState().addPart('nand', { x: 10, y: 0 });
    const s = store.getState;
    s().beginGesture();
    s().moveSelection({ x: 1, y: 0 });
    s().moveSelection({ x: 1, y: 0 });
    s().moveSelection({ x: 0, y: 3 });
    s().endGesture();
    expect(s().past).toHaveLength(2); // add + drag
    expect(s().circuit.components.at(-1)?.pos).toEqual({ x: 12, y: 3 });
    s().undo();
    expect(s().circuit.components.at(-1)?.pos).toEqual({ x: 10, y: 0 });
  });

  it('cancelling a gesture restores the circuit and records nothing', () => {
    const store = make();
    store.getState().addPart('nand', { x: 10, y: 0 });
    const before = store.getState().circuit;
    store.getState().beginGesture();
    store.getState().moveParts(['p1'], { x: 5, y: 5 });
    store.getState().cancelGesture();
    expect(store.getState().circuit).toBe(before);
    expect(store.getState().past).toHaveLength(1);
  });

  it('records nothing for a gesture that changed nothing', () => {
    const store = make();
    store.getState().beginGesture();
    store.getState().endGesture();
    expect(store.getState().past).toHaveLength(0);
  });

  it('records nothing for edits that change nothing', () => {
    const store = make();
    store.getState().select({ components: ['in:A'], wires: [] });
    store.getState().deleteSelection(); // IO can't be deleted
    store.getState().rotateSelection();
    expect(store.getState().past).toHaveLength(0);
  });

  it('deletes the selection and prunes it', () => {
    const store = make();
    store.getState().addPart('nand', { x: 10, y: 0 });
    store.getState().deleteSelection();
    expect(store.getState().circuit.components).toHaveLength(2);
    expect(store.getState().selection.components).toEqual([]);
  });

  it('duplicates the selection and selects the copies', () => {
    const store = make();
    store.getState().addPart('nand', { x: 10, y: 0 });
    store.getState().duplicateSelection();
    expect(store.getState().selection.components).toEqual(['p2']);
  });

  it('clears redo history on a new edit', () => {
    const store = make();
    store.getState().addPart('nand', { x: 0, y: 0 });
    store.getState().undo();
    store.getState().addPart('nand', { x: 5, y: 0 });
    expect(store.getState().future).toEqual([]);
  });

  it(`keeps at most ${HISTORY_LIMIT} undo steps`, () => {
    const store = make();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) store.getState().addPart('nand', { x: i, y: 0 });
    expect(store.getState().past).toHaveLength(HISTORY_LIMIT);
  });

  it('toggles inputs outside the undo history', () => {
    const store = make();
    store.getState().toggleInput('A');
    expect(store.getState().inputs).toEqual({ A: 1 });
    store.getState().toggleInput('A');
    expect(store.getState().inputs).toEqual({ A: 0 });
    expect(store.getState().past).toHaveLength(0);
  });

  it('load replaces the circuit and clears history', () => {
    const store = make();
    store.getState().addPart('nand', { x: 0, y: 0 });
    store.getState().load(startCircuit({ inputs: [], outputs: [] }));
    expect(store.getState().past).toEqual([]);
    expect(store.getState().circuit.components).toEqual([]);
  });
});
