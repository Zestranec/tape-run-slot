/**
 * RunController — actions economy for a single run.
 *
 * A run starts with START_ACTIONS actions and ends when actions reach 0.
 * Each SPIN costs 1 action.
 * Each NUDGE costs a fatigue-based amount (see getNudgeCost).
 * LOCK/UNLOCK has no cost.
 */
export class RunController {
  static readonly START_ACTIONS = 15;
  static readonly MAX_ACTIONS   = 15;

  private _actions: number;
  private _nudgeCount: number;

  get actions(): number    { return this._actions;    }
  get nudgeCount(): number { return this._nudgeCount; }
  get isEnded(): boolean   { return this._actions <= 0; }

  constructor() {
    this._actions    = RunController.START_ACTIONS;
    this._nudgeCount = 0;
  }

  canSpend(cost: number): boolean {
    return this._actions >= cost;
  }

  /** Deduct cost; clamps to 0 (never goes negative). */
  spend(cost: number): void {
    this._actions = Math.max(0, this._actions - cost);
  }

  /**
   * Nudge cost based on nudgeCount BEFORE the increment.
   *   nudgeCount 0-2  → cost 1
   *   nudgeCount 3-5  → cost 2
   *   nudgeCount 6+   → cost 3
   */
  getNudgeCost(): number {
    if (this._nudgeCount < 3) return 1;
    if (this._nudgeCount < 6) return 2;
    return 3;
  }

  /**
   * Record a successful nudge: increment nudgeCount and return the cost
   * that was (and should already have been) spent.
   * Caller MUST call canSpend + spend BEFORE calling this.
   */
  recordNudge(): number {
    const cost = this.getNudgeCost();
    this._nudgeCount++;
    return cost;
  }

  /**
   * Add `n` actions (e.g. tier-2+ card claim bonus), clamped to maxActions.
   * Used by the claim handler in main.ts.
   */
  addActions(n: number): void {
    this._actions = Math.min(RunController.MAX_ACTIONS, this._actions + n);
  }

  /** Full run reset: restore actions to max, clear nudge fatigue. */
  resetRun(): void {
    this._actions    = RunController.START_ACTIONS;
    this._nudgeCount = 0;
  }
}
