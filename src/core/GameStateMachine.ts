export type GameState = "idle" | "running" | "resolve" | "ended";

type StateChangeListener = (prev: GameState, next: GameState) => void;

export class GameStateMachine {
  private _state: GameState = "idle";
  private listeners: StateChangeListener[] = [];

  get state(): GameState { return this._state; }

  get isIdle(): boolean  { return this._state === "idle";   }
  get isEnded(): boolean { return this._state === "ended";  }

  /**
   * True while animation is running (running/resolve) OR the run has ended.
   * Used as a blanket guard for all game actions.
   */
  get isLocked(): boolean { return this._state !== "idle"; }

  onChange(listener: StateChangeListener): void {
    this.listeners.push(listener);
  }

  transition(to: GameState): void {
    if (this._state === to) return;

    const validTransitions: Record<GameState, GameState[]> = {
      idle:    ["running", "ended"],   // ended: run out of actions while idle
      running: ["resolve"],
      resolve: ["idle", "ended"],      // ended: actions hit 0 while resolve completes
      ended:   ["idle"],               // New Run
    };

    if (!validTransitions[this._state].includes(to)) {
      console.warn(`Invalid transition: ${this._state} → ${to}`);
      return;
    }

    const prev = this._state;
    this._state = to;
    for (const fn of this.listeners) fn(prev, to);
  }

  /**
   * Instant idle→running→resolve→idle cycle for non-animated actions.
   * No-op (with a warning) if current state is not "idle".
   */
  runInstant(): void {
    if (this._state !== "idle") {
      console.warn(`runInstant() called in state '${this._state}' — ignored`);
      return;
    }
    this.transition("running");
    this.transition("resolve");
    this.transition("idle");
  }
}
