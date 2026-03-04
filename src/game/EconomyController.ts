/**
 * Tracks bet size, ante toggle, and accumulated winnings for the current run.
 * Pure state — no RNG, no rendering concerns.
 */
export class EconomyController {
  static readonly BET_OPTIONS = [5, 10, 20, 50] as const;
  static readonly ANTE_MULTIPLIER = 1.25;

  private _baseBet = 10;
  private _anteEnabled = false;
  private _totalWin = 0;

  get baseBet(): number      { return this._baseBet;      }
  get anteEnabled(): boolean { return this._anteEnabled;   }
  get totalWin(): number     { return this._totalWin;      }

  get totalBet(): number {
    const raw = this._baseBet * (this._anteEnabled ? EconomyController.ANTE_MULTIPLIER : 1);
    return Math.round(raw * 100) / 100;
  }

  get profit(): number {
    return Math.round((this._totalWin - this.totalBet) * 100) / 100;
  }

  setBaseBet(bet: number): void   { this._baseBet = bet;         }
  setAnteEnabled(on: boolean): void { this._anteEnabled = on;    }

  /** Reset winnings for a New Run. Bet and ante settings are preserved. */
  resetRun(): void {
    this._totalWin = 0;
  }

  /**
   * Add a payout (payoutMult × baseBet) to the running total.
   * Returns the FUN amount added (rounded to 2 d.p.).
   */
  addWin(payoutMult: number): number {
    const win = Math.round(payoutMult * this._baseBet * 100) / 100;
    this._totalWin = Math.round((this._totalWin + win) * 100) / 100;
    return win;
  }
}
