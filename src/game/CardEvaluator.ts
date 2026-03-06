/**
 * CardEvaluator — poker-style mission evaluator for 5-reel symbol arrays.
 *
 * Input: number[] of length 5, where each number is a symbol index (0-16).
 *   Indices 0-15 = normal cards (8 ranks × 2 suits), index 16 = Joker.
 *
 * Joker is a full wildcard (any rank, any suit).
 * Evaluation uses brute-force Joker substitution for complex missions.
 * Simple count-based missions use direct math for distance computation.
 */

import { CardDef } from "../types/CardTypes";
import {
  ALL_SYMBOLS, JOKER_IDX, RANK_ORDER, STRAIGHT_3, STRAIGHT_5,
  FACE_RANKS, LOW_RANKS, getSymbol, CardSymbol, Suit,
} from "../types/PokerTypes";

// ── Public types ───────────────────────────────────────────────────────────────

export interface CardEvalResult {
  matched:  boolean;
  /**
   * 0 → satisfied.  1 → one reel change away.  2+ → further.
   * Simple missions compute exact distance; complex ones return 99.
   */
  distance: number;
}

export interface NearMissHint {
  /** Zero-based reel indices that need to change. */
  reels:    number[];
  wanted?:  string; // symbol text hint, if determinable
}

// ── Joker substitution helper ─────────────────────────────────────────────────

/**
 * Try all substitutions of Joker slots with normal symbols (0-15).
 * Returns true as soon as `check(substituted)` is true.
 * If no jokers, calls check once with the original array.
 */
function withJokerSubs(
  symbolIdxs: readonly number[],
  check: (idxs: number[]) => boolean,
): boolean {
  const jPos: number[] = [];
  for (let i = 0; i < symbolIdxs.length; i++) {
    if (symbolIdxs[i] === JOKER_IDX) jPos.push(i);
  }
  if (jPos.length === 0) return check(symbolIdxs as number[]);

  const arr = [...symbolIdxs];

  if (jPos.length === 1) {
    const p = jPos[0];
    for (let s = 0; s < 16; s++) {
      arr[p] = s;
      if (check(arr)) return true;
    }
    return false;
  }
  // 2 jokers (unlikely but possible with SYMBOL_POOL generating occasional duplicates on a 5-reel tape)
  const p0 = jPos[0], p1 = jPos[1];
  for (let s0 = 0; s0 < 16; s0++) {
    arr[p0] = s0;
    for (let s1 = 0; s1 < 16; s1++) {
      arr[p1] = s1;
      if (check(arr)) return true;
    }
  }
  return false;
}

// ── Rank/suit helpers (no Joker) ───────────────────────────────────────────────

function rankFreqs(idxs: number[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of idxs) {
    const r = ALL_SYMBOLS[i]!.rank as string;
    m.set(r, (m.get(r) ?? 0) + 1);
  }
  return m;
}

function suitCount(idxs: number[], suit: Suit): number {
  return idxs.filter(i => ALL_SYMBOLS[i]?.suit === suit).length;
}

function faceCount(idxs: number[]): number {
  return idxs.filter(i => FACE_RANKS.has(ALL_SYMBOLS[i]?.rank as never)).length;
}

function lowCount(idxs: number[]): number {
  return idxs.filter(i => LOW_RANKS.has(ALL_SYMBOLS[i]?.rank as never)).length;
}

function rankOrderOf(sym: CardSymbol): number {
  return RANK_ORDER[sym.rank] ?? -1;
}

// ── Pure boolean checks (no Joker) ─────────────────────────────────────────────

function checkStraight5(idxs: number[]): boolean {
  const orders = idxs.map(i => rankOrderOf(getSymbol(i))).sort((a, b) => a - b);
  return STRAIGHT_5.some(seq => seq.every((v, j) => v === orders[j]));
}

function checkStraight3(idxs: number[]): boolean {
  const orders = idxs.map(i => rankOrderOf(getSymbol(i)));
  const sorted3 = (a: number, b: number, c: number) => {
    const t = [a, b, c].sort((x, y) => x - y);
    return STRAIGHT_3.some(seq => seq[0] === t[0] && seq[1] === t[1] && seq[2] === t[2]);
  };
  const n = orders.length;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        if (sorted3(orders[a], orders[b], orders[c])) return true;
      }
    }
  }
  return false;
}

function checkFlush(idxs: number[]): boolean {
  const suits = idxs.map(i => getSymbol(i).suit);
  return suits.every(s => s === suits[0]);
}

function checkKindN(idxs: number[], n: number): boolean {
  const freq = rankFreqs(idxs);
  return [...freq.values()].some(v => v >= n);
}

function checkFullHouse(idxs: number[]): boolean {
  const freq = rankFreqs(idxs);
  const vals = [...freq.values()].sort((a, b) => b - a);
  return vals[0] >= 3 && vals[1] >= 2;
}

function checkTwoPair(idxs: number[]): boolean {
  const freq = rankFreqs(idxs);
  return [...freq.values()].filter(v => v >= 2).length >= 2;
}

function checkAnyPair(idxs: number[]): boolean {
  return checkKindN(idxs, 2);
}

function checkEdgeRank(idxs: number[]): boolean {
  return getSymbol(idxs[0]).rank === getSymbol(idxs[4]).rank;
}

function checkSplitPair(idxs: number[]): boolean {
  const windows = [[0, 1, 2], [1, 2, 3], [2, 3, 4]] as const;
  return windows.some(([a, , c]) =>
    getSymbol(idxs[a]).rank === getSymbol(idxs[c]).rank,
  );
}

function checkAdjFace(idxs: number[]): boolean {
  for (let i = 0; i < idxs.length - 1; i++) {
    if (FACE_RANKS.has(getSymbol(idxs[i]).rank as never) &&
        FACE_RANKS.has(getSymbol(idxs[i + 1]).rank as never)) return true;
  }
  return false;
}

// ── Primary isCardSatisfied ────────────────────────────────────────────────────

/**
 * Pure function: returns true if the 5-symbol row satisfies the card's pattern.
 * symbolIdxs: number[] of symbol indices (0-16), length 5.
 * Joker is handled via brute-force substitution for all complex missions.
 */
export function isCardSatisfied(card: CardDef, symbolIdxs: number[]): boolean {
  const { type, params } = card.pattern;
  const jokers = symbolIdxs.filter(i => i === JOKER_IDX).length;

  switch (type) {

    case "POKER_SUIT_COUNT": {
      const suit = params.suit as Suit;
      const have = suitCount(symbolIdxs.filter(i => i !== JOKER_IDX), suit);
      return have + jokers >= (params.count as number);
    }

    case "POKER_FACE_COUNT": {
      const have = faceCount(symbolIdxs.filter(i => i !== JOKER_IDX));
      return have + jokers >= (params.count as number);
    }

    case "POKER_LOW_COUNT": {
      const have = lowCount(symbolIdxs.filter(i => i !== JOKER_IDX));
      return have + jokers >= (params.count as number);
    }

    case "POKER_EDGE_RANK": {
      if (jokers === 0) return checkEdgeRank(symbolIdxs);
      // Joker at position 0 or 4 matches anything
      return withJokerSubs(symbolIdxs, checkEdgeRank);
    }

    case "POKER_ANY_PAIR": {
      if (jokers === 0) return checkAnyPair(symbolIdxs);
      if (jokers >= 2) return true; // two jokers always pair
      // 1 joker: needs at least 1 normal card (to pair with)
      return symbolIdxs.some(i => i !== JOKER_IDX);
    }

    case "POKER_SPLIT_PAIR": {
      if (jokers === 0) return checkSplitPair(symbolIdxs);
      return withJokerSubs(symbolIdxs, checkSplitPair);
    }

    case "POKER_ADJ_FACE": {
      const isFaceIdx = (i: number) =>
        i === JOKER_IDX || FACE_RANKS.has(getSymbol(i).rank as never);
      for (let j = 0; j < symbolIdxs.length - 1; j++) {
        if (isFaceIdx(symbolIdxs[j]) && isFaceIdx(symbolIdxs[j + 1])) return true;
      }
      return false;
    }

    case "POKER_THREE_KIND": {
      if (jokers === 0) return checkKindN(symbolIdxs, 3);
      if (jokers >= 3) return true;
      const normals = symbolIdxs.filter(i => i !== JOKER_IDX);
      const freq = rankFreqs(normals);
      const maxF = Math.max(0, ...freq.values());
      return maxF + jokers >= 3;
    }

    case "POKER_TWO_PAIR": {
      if (jokers === 0) return checkTwoPair(symbolIdxs);
      return withJokerSubs(symbolIdxs, checkTwoPair);
    }

    case "POKER_FULL_HOUSE": {
      if (jokers === 0) return checkFullHouse(symbolIdxs);
      return withJokerSubs(symbolIdxs, checkFullHouse);
    }

    case "POKER_FOUR_KIND": {
      if (jokers === 0) return checkKindN(symbolIdxs, 4);
      if (jokers >= 4) return true;
      const normals = symbolIdxs.filter(i => i !== JOKER_IDX);
      const freq = rankFreqs(normals);
      const maxF = Math.max(0, ...freq.values());
      return maxF + jokers >= 4;
    }

    case "POKER_FIVE_KIND": {
      if (jokers >= 5) return true;
      const normals = symbolIdxs.filter(i => i !== JOKER_IDX);
      const freq = rankFreqs(normals);
      const maxF = Math.max(0, ...freq.values());
      return maxF + jokers >= 5;
    }

    case "POKER_MINI_STRAIGHT": {
      if (jokers === 0) return checkStraight3(symbolIdxs);
      return withJokerSubs(symbolIdxs, checkStraight3);
    }

    case "POKER_STRAIGHT": {
      if (jokers === 0) return checkStraight5(symbolIdxs);
      return withJokerSubs(symbolIdxs, checkStraight5);
    }

    case "POKER_FLUSH": {
      // All 5 same suit AND at least 1 face card (J/Q/K/A).
      // Joker can substitute for any rank/suit, satisfying both conditions.
      if (jokers === 0) {
        const hasFace = symbolIdxs.some(i => FACE_RANKS.has(getSymbol(i).rank as never));
        return hasFace && checkFlush(symbolIdxs);
      }
      return withJokerSubs(symbolIdxs, idxs => {
        const hasFace = idxs.some(i => FACE_RANKS.has(getSymbol(i).rank as never));
        return hasFace && checkFlush(idxs);
      });
    }

    case "POKER_STRAIGHT_FLUSH": {
      if (jokers === 0) {
        return checkStraight5(symbolIdxs) && checkFlush(symbolIdxs);
      }
      return withJokerSubs(symbolIdxs, idxs => checkStraight5(idxs) && checkFlush(idxs));
    }

    // ── Exact-count variants ────────────────────────────────────────────────

    case "POKER_SUIT_EXACT": {
      // Exactly N of a suit: have ≤ count AND have + jokers ≥ count
      const suit = params.suit as Suit;
      const have = suitCount(symbolIdxs.filter(i => i !== JOKER_IDX), suit);
      return have <= (params.count as number) && have + jokers >= (params.count as number);
    }

    case "POKER_FACE_EXACT": {
      const have = faceCount(symbolIdxs.filter(i => i !== JOKER_IDX));
      return have <= (params.count as number) && have + jokers >= (params.count as number);
    }

    case "POKER_LOW_EXACT": {
      const have = lowCount(symbolIdxs.filter(i => i !== JOKER_IDX));
      return have <= (params.count as number) && have + jokers >= (params.count as number);
    }

    case "POKER_EXACT_PAIR": {
      // Exactly one pair: rank has exactly one freq=2, all others freq=1, no freq≥3
      const check = (idxs: number[]): boolean => {
        const freq = rankFreqs(idxs);
        const vals = [...freq.values()];
        return vals.filter(v => v === 2).length === 1 && vals.every(v => v <= 2);
      };
      if (jokers === 0) return check(symbolIdxs);
      return withJokerSubs(symbolIdxs, check);
    }

    case "POKER_ADJ_FACE_EXACT": {
      // Exactly 2 face cards total AND those 2 are adjacent
      const check = (idxs: number[]): boolean => {
        const isFacePos = idxs.map(i => FACE_RANKS.has(getSymbol(i).rank as never));
        if (isFacePos.filter(Boolean).length !== 2) return false;
        for (let i = 0; i < idxs.length - 1; i++) {
          if (isFacePos[i] && isFacePos[i + 1]) return true;
        }
        return false;
      };
      if (jokers === 0) return check(symbolIdxs);
      return withJokerSubs(symbolIdxs, check);
    }

    case "POKER_TWO_PAIR_STRICT": {
      // Exactly 2 pairs, not full house (no rank with freq≥3)
      const check = (idxs: number[]): boolean => {
        const freq = rankFreqs(idxs);
        const vals = [...freq.values()];
        return vals.filter(v => v === 2).length === 2 && vals.every(v => v <= 2);
      };
      if (jokers === 0) return check(symbolIdxs);
      return withJokerSubs(symbolIdxs, check);
    }

    default:
      return false;
  }
}

// ── Distance-aware evaluation ──────────────────────────────────────────────────

export function evaluateCard(card: CardDef, symbolIdxs: number[]): CardEvalResult {
  const distance = computeDistance(card, symbolIdxs);
  return { matched: distance === 0, distance };
}

function computeDistance(card: CardDef, symbolIdxs: number[]): number {
  const { type, params } = card.pattern;
  const jokers = symbolIdxs.filter(i => i === JOKER_IDX).length;

  if (isCardSatisfied(card, symbolIdxs)) return 0;

  // ── Simple count-based missions: exact distance ───────────────────────────
  switch (type) {
    case "POKER_SUIT_COUNT": {
      const have = suitCount(symbolIdxs.filter(i => i !== JOKER_IDX), params.suit as Suit);
      return Math.max(0, (params.count as number) - (have + jokers));
    }
    case "POKER_FACE_COUNT": {
      const have = faceCount(symbolIdxs.filter(i => i !== JOKER_IDX));
      return Math.max(0, (params.count as number) - (have + jokers));
    }
    case "POKER_LOW_COUNT": {
      const have = lowCount(symbolIdxs.filter(i => i !== JOKER_IDX));
      return Math.max(0, (params.count as number) - (have + jokers));
    }
    case "POKER_EDGE_RANK": {
      // Distance 1 if exactly one reel change (or a joker already present) would suffice.
      // Since isCardSatisfied returned false here, neither is a joker.
      // One substitution of reel[0] or reel[4] would fix it → distance 1.
      return 1;
    }
    case "POKER_ANY_PAIR": {
      // If no joker and no pair, exactly 1 change suffices (change any card to match another).
      if (jokers === 0) return 1;
      return 1; // with joker, any single card → instant pair → already satisfied (handled above)
    }
    case "POKER_THREE_KIND": {
      const normals = symbolIdxs.filter(i => i !== JOKER_IDX);
      const freq = rankFreqs(normals);
      const maxF = Math.max(0, ...freq.values());
      return 3 - (maxF + jokers);
    }
    case "POKER_FOUR_KIND": {
      const normals = symbolIdxs.filter(i => i !== JOKER_IDX);
      const freq = rankFreqs(normals);
      const maxF = Math.max(0, ...freq.values());
      return 4 - (maxF + jokers);
    }
    case "POKER_FIVE_KIND": {
      const normals = symbolIdxs.filter(i => i !== JOKER_IDX);
      const freq = rankFreqs(normals);
      const maxF = Math.max(0, ...freq.values());
      return 5 - (maxF + jokers);
    }
    // ── Exact-count distance ─────────────────────────────────────────────────
    case "POKER_SUIT_EXACT": {
      const suit = params.suit as Suit;
      const have = suitCount(symbolIdxs.filter(i => i !== JOKER_IDX), suit);
      const count = params.count as number;
      return have > count ? have - count : count - have - jokers;
    }
    case "POKER_FACE_EXACT": {
      const have = faceCount(symbolIdxs.filter(i => i !== JOKER_IDX));
      const count = params.count as number;
      return have > count ? have - count : count - have - jokers;
    }
    case "POKER_LOW_EXACT": {
      const have = lowCount(symbolIdxs.filter(i => i !== JOKER_IDX));
      const count = params.count as number;
      return have > count ? have - count : count - have - jokers;
    }
    default:
      return 99; // complex mission — not shown as "almost"
  }
}

// ── Near-miss reel hint ────────────────────────────────────────────────────────

/**
 * Returns reel-level "near miss" hint for missions that are exactly distance=1.
 * Returns null for complex missions (first-pass: only simple missions supported).
 */
export function getNearMissHint(
  card: CardDef,
  symbolIdxs: number[],
): NearMissHint | null {
  if (!evaluateCard(card, symbolIdxs).distance) return null;
  if (computeDistance(card, symbolIdxs) !== 1) return null;

  const { type, params } = card.pattern;

  switch (type) {
    case "POKER_EDGE_RANK": {
      // Suggest the last reel should match the first.
      return { reels: [0, 4] };
    }
    case "POKER_SUIT_COUNT": {
      // Find a reel that is NOT the required suit and suggest changing it.
      const suit = params.suit as Suit;
      const wrong = symbolIdxs
        .map((idx, ri) => ({ idx, ri }))
        .filter(({ idx }) => idx !== JOKER_IDX && getSymbol(idx).suit !== suit)
        .map(({ ri }) => ri);
      if (wrong.length > 0) return { reels: [wrong[0]] };
      return null;
    }
    default:
      return null;
  }
}
