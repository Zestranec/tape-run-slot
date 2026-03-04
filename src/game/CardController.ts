import { CARDS } from "../config/cards";
import { isCardSatisfied } from "./CardEvaluator";

/**
 * Tracks which mission cards are READY and CLAIMED for the current run.
 * Pure state — no RNG, no Pixi, no rendering concerns.
 */
export class CardController {
  private _claimed = new Set<string>();
  private _ready   = new Set<string>();

  get readyIds(): ReadonlySet<string>   { return this._ready;   }
  get claimedIds(): ReadonlySet<string> { return this._claimed; }

  /** Full reset for a New Run. */
  resetRun(): void {
    this._claimed.clear();
    this._ready.clear();
  }

  /**
   * Re-evaluate all unclaimed cards against the current visible digits.
   * Call after every digit change (spin resolve, nudge, new run).
   */
  updateReady(digits: number[]): void {
    this._ready.clear();
    for (const card of CARDS) {
      if (!this._claimed.has(card.id) && isCardSatisfied(card, digits)) {
        this._ready.add(card.id);
      }
    }
  }

  canClaim(cardId: string): boolean {
    return this._ready.has(cardId) && !this._claimed.has(cardId);
  }

  /**
   * Claim a card. Caller must have checked canClaim first.
   * Returns payout multiplier and tier (caller handles economy side-effects).
   */
  claim(cardId: string): { payoutMult: number; tier: number } {
    const card = CARDS.find(c => c.id === cardId);
    if (!card) throw new Error(`[CardController] Unknown card id: ${cardId}`);
    this._claimed.add(cardId);
    this._ready.delete(cardId);
    return { payoutMult: card.payoutMult, tier: card.tier };
  }
}
