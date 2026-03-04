/**
 * BotStrategy — deterministic decision policies for the simulation bot.
 *
 * Two policies are provided:
 *
 *   "baseline"  — Never nudge.  Just spin, evaluate, claim best, spin again.
 *
 *   "smart"     — Evaluate every cheap single-step nudge (7 reels × ±1 = 14
 *                 candidates) before each spin.  Perform the nudge that would
 *                 create the highest-value newly available card, provided the
 *                 nudge cost is ≤ 2 actions.  Fall through to a spin if no
 *                 beneficial nudge is found.
 *
 * All functions are pure (no mutation of their arguments) and deterministic:
 * the same inputs always produce the same outputs.
 */

import { CARDS } from "../config/cards";
import { CardDef } from "../types/CardTypes";
import { isCardSatisfied } from "../game/CardEvaluator";
import { RNG } from "../core/RNG";

export type Policy = "baseline" | "smart" | "random";

// ── Shared tape-navigation helpers ────────────────────────────────────────────

/** Safe modular wrap — handles negative numbers correctly. */
export function wrap(n: number, len: number): number {
  return ((n % len) + len) % len;
}

/**
 * Write center digits for every reel into `out`.
 * `tapes[i][offsets[i]]` is the center digit of reel i.
 */
export function computeDigits(
  tapes:   readonly number[][],
  offsets: readonly number[],
  len:     number,
  out:     number[],
): void {
  for (let i = 0; i < tapes.length; i++) {
    out[i] = tapes[i][wrap(offsets[i], len)];
  }
}

// ── Card selection ────────────────────────────────────────────────────────────

/**
 * Baseline/smart: choose the single best card to claim from `available`.
 *
 * Priority order (fully deterministic tie-breaking):
 *   1. Highest payoutMult
 *   2. Highest tier
 *   3. Lexicographically smallest id (stable across runs)
 */
export function chooseCard(available: CardDef[]): CardDef {
  return available.slice().sort((a, b) => {
    if (b.payoutMult !== a.payoutMult) return b.payoutMult - a.payoutMult;
    if (b.tier       !== a.tier)       return b.tier       - a.tier;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/**
 * Random policy: choose a card uniformly at random using the run's decision RNG.
 *
 * The decision RNG is seeded as `new RNG(runSeed ^ 0x9E3779B9)` so it is
 * completely independent of the spin-outcome RNG stream.  Cards are sorted
 * deterministically first (by id) so the same RNG state always maps to the
 * same card regardless of Set or Map iteration order.
 */
export function chooseCardRandom(available: CardDef[], rng: RNG): CardDef {
  // Sort by id for a stable, reproducible ordering before drawing.
  const sorted = available.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted[rng.nextInt(0, sorted.length - 1)];
}

// ── Smart-nudge search ────────────────────────────────────────────────────────

export interface NudgeChoice {
  reelIdx:  number;
  delta:    number; // +1 or -1
  bestMult: number; // highest payoutMult achievable after this nudge
}

/**
 * Evaluate all 14 single-step nudge candidates (7 reels × ±1).
 *
 * Returns the nudge that creates the highest-valued newly-available card, or
 * `null` if no nudge improves on the current (pre-nudge) availability.
 *
 * Tie-breaking (deterministic):
 *   1. Highest bestMult
 *   2. Lower reel index
 *   3. +1 delta before −1 delta
 */
export function findBestNudge(
  tapes:      readonly number[][],
  offsets:    readonly number[],
  tapeLen:    number,
  claimedIds: ReadonlySet<string>,
): NudgeChoice | null {
  const unclaimed = CARDS.filter(c => !claimedIds.has(c.id));
  if (unclaimed.length === 0) return null;

  const reelCount = tapes.length;
  // Scratch buffer for digit computation — no heap allocation per candidate.
  const tmp = new Array<number>(reelCount);

  // Baseline: best mult achievable from current position (before any nudge).
  computeDigits(tapes, offsets, tapeLen, tmp);
  let baselineMult = 0;
  for (const card of unclaimed) {
    if (isCardSatisfied(card, tmp)) baselineMult = Math.max(baselineMult, card.payoutMult);
  }

  let best: NudgeChoice | null = null;

  // Iterate reels in ascending order, +1 before −1, so the first candidate
  // we encounter at any given bestMult level is the tie-break winner.
  for (let ri = 0; ri < reelCount; ri++) {
    for (const delta of [1, -1] as const) {
      // Temporarily apply nudge to the scratch offsets.
      const savedOffset = offsets[ri];
      const nudgedOffset = wrap(savedOffset + delta, tapeLen);

      // Build digit array with this one reel nudged.
      for (let i = 0; i < reelCount; i++) {
        tmp[i] = tapes[i][i === ri ? nudgedOffset : wrap(offsets[i], tapeLen)];
      }

      let nudgeMult = 0;
      for (const card of unclaimed) {
        if (isCardSatisfied(card, tmp)) nudgeMult = Math.max(nudgeMult, card.payoutMult);
      }

      // Only adopt this nudge if it strictly improves over baseline AND over
      // any previously found candidate.
      if (nudgeMult > baselineMult && nudgeMult > (best?.bestMult ?? 0)) {
        best = { reelIdx: ri, delta, bestMult: nudgeMult };
      }
    }
  }

  return best;
}
