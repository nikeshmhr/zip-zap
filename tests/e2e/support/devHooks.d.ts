/** The development-only test hooks installed by src/app/devHooks.ts. */
export {};

declare global {
  interface Window {
    __zipzap?: {
      loadLevelCircuit(
        id: string,
        circuit: {
          components: {
            id: string;
            kind: string;
            label?: string;
            pos: { x: number; y: number };
            rot: 0 | 90 | 180 | 270;
          }[];
          wires: {
            id: string;
            from: { comp: string; pin: string };
            to: { comp: string; pin: string };
          }[];
        },
      ): void;
      solveBefore(id: string): void;
      soundLog(): readonly string[];
    };
  }
}
