export type GameState = "betting" | "idle" | "running" | "resolve" | "ended";

type StateChangeListener = (prev: GameState, next: GameState) => void;

export class GameStateMachine {
  private _state: GameState = "betting";
  private listeners: StateChangeListener[] = [];

  get state(): GameState { return this._state; }

  get isBetting(): boolean { return this._state === "betting"; }
  get isIdle(): boolean    { return this._state === "idle";    }
  get isEnded(): boolean   { return this._state === "ended";   }

  /** True when game actions (spin, nudge, lock, card claim) should be blocked. */
  get isLocked(): boolean { return this._state !== "idle"; }

  onChange(listener: StateChangeListener): void {
    this.listeners.push(listener);
  }

  transition(to: GameState): void {
    if (this._state === to) return;

    const validTransitions: Record<GameState, GameState[]> = {
      betting: ["idle"],                 // START RUN
      idle:    ["running", "ended"],     // spin start; nudge uses last action
      running: ["resolve"],              // animation done
      resolve: ["idle", "ended"],        // normal; actions hit 0
      ended:   ["idle", "betting"],      // tier2+ claim resumes; RETURN TO BETTING
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
