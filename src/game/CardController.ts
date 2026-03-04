import { CARDS } from "../config/cards";
import { isCardSatisfied, evaluateCard } from "./CardEvaluator";

/**
 * Tracks mission card state for a single run.
 *
 * Spin-gate model
 * ───────────────
 * • After each spin resolves, ALL unclaimed cards whose patterns match the
 *   current 7-digit row are marked as AVAILABLE (ready to claim).
 * • The player may claim exactly ONE available card, or skip to spin again.
 * • Claiming one card clears all other available cards (they do not pay).
 * • Once claimed a card is permanently CLAIMED and can never become
 *   available again.
 *
 * Almost logic (UI-only, no effect on payouts / RNG)
 * ────────────────────────────────────────────────────
 * • almostAllIds  : unclaimed cards with distance==1 from the current digits
 *                   (excludes cards that are READY / AVAILABLE).
 * • almostShownIds: filtered subset actually highlighted yellow in the UI.
 *
 *   Filtering rule:
 *   ┌─ If READY cards exist ─────────────────────────────────────────────────┐
 *   │  maxReadyTier = highest tier among READY cards.                        │
 *   │  If maxReadyTier < 4:  show ALMOST only for tier == maxReadyTier + 1. │
 *   │  If maxReadyTier == 4: show no ALMOST (no higher tier).               │
 *   └────────────────────────────────────────────────────────────────────────┘
 *   ┌─ If NO READY cards ────────────────────────────────────────────────────┐
 *   │  Show ALMOST for all almostAllIds.                                     │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 *   Both sets are cleared immediately when a card is claimed or on any skip /
 *   run reset, so yellow highlights can never linger after a claim.
 */
export class CardController {
  private _claimed          = new Set<string>();
  private _available        = new Set<string>();
  private _claimedThisSpin  = false;

  // Almost sets (purely visual)
  private _almostAll    = new Set<string>();
  private _almostShown  = new Set<string>();

  // ── Getters ───────────────────────────────────────────────────────────────────
  get claimedIds():      ReadonlySet<string> { return this._claimed;     }
  get availableIds():    ReadonlySet<string> { return this._available;   }
  get almostShownIds():  ReadonlySet<string> { return this._almostShown; }
  get claimedThisSpin(): boolean             { return this._claimedThisSpin; }

  /** True when at least one card is available to claim this spin. */
  hasAvailable(): boolean { return this._available.size > 0; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  /** Full reset at the start of a new run. */
  resetRun(): void {
    this._claimed.clear();
    this._available.clear();
    this._almostAll.clear();
    this._almostShown.clear();
    this._claimedThisSpin = false;
  }

  /**
   * Call once after a spin animation resolves and the model offsets are snapped.
   * Evaluates ALL unclaimed cards against `digits`:
   *   • matching cards  → available (READY, green)
   *   • distance==1     → almost candidates (yellow, UI-only)
   * Resets the per-spin gate.
   */
  onSpinResolved(digits: number[]): void {
    this._claimedThisSpin = false;
    this._evaluateDigits(digits);
  }

  /**
   * Re-evaluate card states against updated digits WITHOUT starting a new spin
   * (e.g. after a nudge changes one reel's visible digit).
   *
   * Preserves `_claimedThisSpin` so the spin-gate is not disturbed.
   * Use this whenever digits change outside of a spin resolution.
   */
  onDigitsChanged(digits: number[]): void {
    this._evaluateDigits(digits);
  }

  // ── Claim / skip ──────────────────────────────────────────────────────────────

  /**
   * Returns true when `cardId` is currently available to claim.
   */
  canClaim(cardId: string): boolean {
    return this._available.has(cardId) && !this._claimed.has(cardId);
  }

  /**
   * Player chose to SPIN instead of claiming any available card.
   * Clears available and both almost sets so no highlights linger.
   */
  clearAvailable(): void {
    this._available.clear();
    this._almostAll.clear();
    this._almostShown.clear();
  }

  /**
   * Claim one available card.
   * • Adds it to claimed (permanently).
   * • Clears ALL available cards — other matching cards do NOT pay.
   * • Clears both almost sets immediately (bugfix: yellow must vanish on claim).
   * • Sets claimedThisSpin = true to re-enable SPIN.
   *
   * Caller must have verified `canClaim()` first.
   * Returns payout multiplier and tier for the caller to apply to economy.
   */
  claimOne(cardId: string): { payoutMult: number; tier: number } {
    const card = CARDS.find(c => c.id === cardId);
    if (!card) throw new Error(`[CardController] Unknown card id: ${cardId}`);

    this._claimed.add(cardId);
    this._available.clear();
    this._almostAll.clear();    // ← bugfix: stop yellow highlights immediately
    this._almostShown.clear();  // ← bugfix
    this._claimedThisSpin = true;

    return { payoutMult: card.payoutMult, tier: card.tier };
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  /**
   * Core evaluation: populate `_available` and `_almostAll` from `digits`,
   * then recompute the filtered `_almostShown` set.
   * Shared by onSpinResolved and onDigitsChanged.
   */
  private _evaluateDigits(digits: number[]): void {
    this._available.clear();
    this._almostAll.clear();
    this._almostShown.clear();

    for (const card of CARDS) {
      if (this._claimed.has(card.id)) continue;

      const { matched, distance } = evaluateCard(card, digits);
      if (matched) {
        this._available.add(card.id);
      } else if (distance === 1) {
        this._almostAll.add(card.id);
      }
    }

    this._recomputeAlmostShown();
  }

  /**
   * Populate `_almostShown` from `_almostAll` using the tier-filtering rule.
   *
   * If READY cards exist: show ALMOST only for tier == (maxReadyTier + 1).
   * If no READY cards:    show all of almostAll.
   */
  private _recomputeAlmostShown(): void {
    this._almostShown.clear();

    if (this._available.size === 0) {
      // No READY cards — show every almost candidate.
      for (const id of this._almostAll) this._almostShown.add(id);
      return;
    }

    // Determine the highest tier among READY cards.
    let maxReadyTier = 0;
    for (const id of this._available) {
      const card = CARDS.find(c => c.id === id);
      if (card && card.tier > maxReadyTier) maxReadyTier = card.tier;
    }

    if (maxReadyTier >= 4) return; // no higher tier exists — show nothing

    const targetTier = maxReadyTier + 1;
    for (const id of this._almostAll) {
      const card = CARDS.find(c => c.id === id);
      if (card && card.tier === targetTier) this._almostShown.add(id);
    }
  }
}
