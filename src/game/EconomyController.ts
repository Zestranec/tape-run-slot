/**
 * Tracks bet size and accumulated winnings for the current run.
 * Pure state — no RNG, no rendering concerns.
 */
export class EconomyController {
  static readonly BASE_BET = 10;

  private _totalWin = 0;

  get baseBet(): number  { return EconomyController.BASE_BET; }
  get totalWin(): number { return this._totalWin;             }

  /** Reset for a New Run. */
  resetRun(): void {
    this._totalWin = 0;
  }

  /**
   * Add a payout (payoutMult × baseBet) to the running total.
   * Returns the FUN amount added (rounded to 2 d.p.).
   */
  addWin(payoutMult: number): number {
    const win = Math.round(payoutMult * EconomyController.BASE_BET * 100) / 100;
    this._totalWin = Math.round((this._totalWin + win) * 100) / 100;
    return win;
  }
}
