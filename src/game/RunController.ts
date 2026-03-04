/**
 * RunController — actions economy for a single run.
 *
 * A run starts with startActions and ends when actions reach 0.
 * Each SPIN costs 1 action.
 * Each NUDGE costs a fatigue-based amount (see getNudgeCost).
 * LOCK/UNLOCK has no cost.
 *
 * Call configure(ante) before resetRun() to set the correct action budget.
 */
export class RunController {
  static readonly DEFAULT_ACTIONS = 15;
  static readonly ANTE_ACTIONS    = 18;

  private _startActions = RunController.DEFAULT_ACTIONS;
  private _maxActions   = RunController.DEFAULT_ACTIONS;
  private _actions: number;
  private _nudgeCount: number;

  get startActions(): number { return this._startActions; }
  get maxActions(): number   { return this._maxActions;   }
  get actions(): number      { return this._actions;      }
  get nudgeCount(): number   { return this._nudgeCount;   }
  get isEnded(): boolean     { return this._actions <= 0; }

  constructor() {
    this._actions    = this._startActions;
    this._nudgeCount = 0;
  }

  /** Set the action budget for the next run based on whether Ante is active. */
  configure(ante: boolean): void {
    const n = ante ? RunController.ANTE_ACTIONS : RunController.DEFAULT_ACTIONS;
    this._startActions = n;
    this._maxActions   = n;
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

  /** Add actions (e.g. tier-2+ card claim bonus), clamped to maxActions. */
  addActions(n: number): void {
    this._actions = Math.min(this._maxActions, this._actions + n);
  }

  /** Full run reset: restore actions to startActions, clear nudge fatigue. */
  resetRun(): void {
    this._actions    = this._startActions;
    this._nudgeCount = 0;
  }
}
