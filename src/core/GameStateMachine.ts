export type GameState = "idle" | "running" | "resolve";

type StateChangeListener = (prev: GameState, next: GameState) => void;

export class GameStateMachine {
  private _state: GameState = "idle";
  private listeners: StateChangeListener[] = [];

  get state(): GameState {
    return this._state;
  }

  get isIdle(): boolean {
    return this._state === "idle";
  }

  get isLocked(): boolean {
    return this._state !== "idle";
  }

  onChange(listener: StateChangeListener): void {
    this.listeners.push(listener);
  }

  transition(to: GameState): void {
    if (this._state === to) return;

    const validTransitions: Record<GameState, GameState[]> = {
      idle: ["running"],
      running: ["resolve"],
      resolve: ["idle"],
    };

    if (!validTransitions[this._state].includes(to)) {
      console.warn(`Invalid transition: ${this._state} → ${to}`);
      return;
    }

    const prev = this._state;
    this._state = to;
    for (const fn of this.listeners) fn(prev, to);
  }

  /** Convenience: run through running→resolve→idle instantly (for non-animated actions). */
  runInstant(): void {
    this.transition("running");
    this.transition("resolve");
    this.transition("idle");
  }
}
