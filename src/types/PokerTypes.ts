/**
 * PokerTypes — shared symbol definitions for the 5-reel poker slot.
 *
 * ZERO PixiJS imports: safe to use in both browser game and Node simulation.
 *
 * Symbol index layout (0-16):
 *   0: 6♥  1: 6♠  2: 7♥  3: 7♠  4: 8♥  5: 8♠  6: 9♥  7: 9♠
 *   8: J♥  9: J♠  10: Q♥ 11: Q♠ 12: K♥ 13: K♠ 14: A♥ 15: A♠
 *   16: Joker
 */

export type Rank = "6" | "7" | "8" | "9" | "J" | "Q" | "K" | "A" | "Joker";
export type Suit = "hearts" | "spades";

export interface CardSymbol {
  rank: Rank;
  suit: Suit | null; // null for Joker
}

export const JOKER_IDX = 16;

export const NORMAL_RANKS: Rank[] = ["6", "7", "8", "9", "J", "Q", "K", "A"];
export const SUITS: Suit[]        = ["hearts", "spades"];

/** Rank order for straight evaluation (6 lowest, A highest). */
export const RANK_ORDER: Record<Rank, number> = {
  "6": 0, "7": 1, "8": 2, "9": 3, "J": 4, "Q": 5, "K": 6, "A": 7,
  "Joker": -1,
};

/** All valid 5-card straight sequences as rank-order indices. */
export const STRAIGHT_5: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1, 2, 3, 4], // 6 7 8 9 J
  [1, 2, 3, 4, 5], // 7 8 9 J Q
  [2, 3, 4, 5, 6], // 8 9 J Q K
  [3, 4, 5, 6, 7], // 9 J Q K A
];

/** All valid 3-card straight sequences as rank-order indices. */
export const STRAIGHT_3: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1, 2], // 6 7 8
  [1, 2, 3], // 7 8 9
  [2, 3, 4], // 8 9 J
  [3, 4, 5], // 9 J Q
  [4, 5, 6], // J Q K
  [5, 6, 7], // Q K A
];

export const FACE_RANKS = new Set<Rank>(["J", "Q", "K", "A"]);
export const LOW_RANKS  = new Set<Rank>(["6", "7", "8", "9"]);

/**
 * Full symbol table — indices 0-15 are normal cards, 16 is Joker.
 * Rank order within each suit: 6, 7, 8, 9, J, Q, K, A.
 * Suits per rank: hearts first (even indices), spades second (odd indices).
 */
export const ALL_SYMBOLS: Readonly<CardSymbol[]> = [
  ...NORMAL_RANKS.flatMap(rank =>
    SUITS.map(suit => ({ rank, suit })),
  ),
  { rank: "Joker", suit: null },
];

/** Retrieve a CardSymbol by its tape index (safe: clamps to Joker on OOB). */
export function getSymbol(idx: number): CardSymbol {
  return ALL_SYMBOLS[idx] ?? ALL_SYMBOLS[JOKER_IDX];
}

/** Convert a tape index to a player-visible string. */
export function symbolToText(idx: number): string {
  const s = getSymbol(idx);
  if (s.rank === "Joker") return "★";
  return s.rank + (s.suit === "hearts" ? "♥" : "♠");
}

/**
 * Weighted symbol pool for tape generation.
 *
 * Each normal symbol (indices 0-15) has weight 100.
 * Joker (index 16) has weight 33.
 * Total entries: 16 × 100 + 33 = 1633.
 *
 * Usage: pool[rng.nextInt(0, pool.length - 1)] → symbol index.
 */
export const SYMBOL_POOL: readonly number[] = (() => {
  const pool: number[] = [];
  for (let i = 0; i < 16; i++) {
    for (let w = 0; w < 100; w++) pool.push(i);
  }
  for (let w = 0; w < 33; w++) pool.push(JOKER_IDX);
  return pool;
})();
