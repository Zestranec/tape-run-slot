import { CARDS } from "../config/cards";
import { isCardSatisfied } from "./CardEvaluator";

/**
 * Tracks mission card state for a single run.
 *
 * Spin-gate model
 * ───────────────
 * • After each spin resolves, ALL unclaimed cards whose patterns match the
 *   current 7-digit row are marked as AVAILABLE.
 * • The player must choose (claim) exactly ONE available card before the
 *   next spin is allowed.  `claimedThisSpin` is the gate flag.
 * • Claiming one card clears all other available cards (they do not pay).
 * • Once claimed a card is permanently CLAIMED and can never become
 *   available again.
 */
export class CardController {
  private _claimed      = new Set<string>();
  private _available    = new Set<string>();
  private _claimedThisSpin = false;

  get claimedIds():     ReadonlySet<string> { return this._claimed;   }
  get availableIds():   ReadonlySet<string> { return this._available; }
  get claimedThisSpin(): boolean            { return this._claimedThisSpin; }

  /** True when at least one card is available to claim this spin. */
  hasAvailable(): boolean { return this._available.size > 0; }

  /** Full reset at the start of a new run. */
  resetRun(): void {
    this._claimed.clear();
    this._available.clear();
    this._claimedThisSpin = false;
  }

  /**
   * Call once after a spin animation resolves and the model offsets are snapped.
   * Evaluates ALL unclaimed cards against `digits`; those that match become
   * available for the player to claim.  Resets the per-spin gate.
   */
  onSpinResolved(digits: number[]): void {
    this._claimedThisSpin = false;
    this._available.clear();

    for (const card of CARDS) {
      if (!this._claimed.has(card.id) && isCardSatisfied(card, digits)) {
        this._available.add(card.id);
      }
    }
  }

  /**
   * Returns true when `cardId` is currently available to claim.
   * (Available implies not-yet-claimed; both checks are redundant but safe.)
   */
  canClaim(cardId: string): boolean {
    return this._available.has(cardId) && !this._claimed.has(cardId);
  }

  /**
   * Player chose to SPIN instead of claiming any available card.
   * Clears the available set without counting as a claim so the next spin
   * can re-evaluate from scratch.  Does NOT set `_claimedThisSpin`.
   * Does NOT consume RNG.
   */
  clearAvailable(): void {
    this._available.clear();
  }

  /**
   * Claim one available card.
   * • Adds it to claimed (permanently).
   * • Clears ALL available cards — other matching cards do NOT pay.
   * • Sets claimedThisSpin = true to re-enable SPIN.
   *
   * Caller must have verified `canClaim()` first.
   * Returns payout multiplier and tier for the caller to apply to economy.
   */
  claimOne(cardId: string): { payoutMult: number; tier: number } {
    const card = CARDS.find(c => c.id === cardId);
    if (!card) throw new Error(`[CardController] Unknown card id: ${cardId}`);

    this._claimed.add(cardId);
    this._available.clear(); // all other available cards lose eligibility
    this._claimedThisSpin = true;

    return { payoutMult: card.payoutMult, tier: card.tier };
  }
}
