export type CardTier = 1 | 2 | 3 | 4;

/**
 * Poker-style pattern types for the 5-reel card evaluator.
 * All evaluation operates on symbol indices (number[]) of length 5.
 */
export type CardPatternType =
  // Count-based at-least (order irrelevant)
  | "POKER_SUIT_COUNT"       // at least N cards of a given suit
  | "POKER_FACE_COUNT"       // at least N face cards (J,Q,K,A)
  | "POKER_LOW_COUNT"        // at least N low cards (6,7,8,9)
  | "POKER_ANY_PAIR"         // any pair by rank
  | "POKER_THREE_KIND"       // three of a kind by rank
  | "POKER_TWO_PAIR"         // two different pairs (incl. full-house)
  | "POKER_FULL_HOUSE"       // 3 of one rank + 2 of another
  | "POKER_FOUR_KIND"        // four of a kind by rank
  | "POKER_FIVE_KIND"        // five of a kind (needs Joker or repeats)
  | "POKER_FLUSH"            // all 5 same suit
  | "POKER_MINI_STRAIGHT"    // any 3 cards (from the 5) form a valid 3-card straight
  | "POKER_STRAIGHT"         // 5-card straight (order in reels irrelevant)
  | "POKER_STRAIGHT_FLUSH"   // straight + flush
  // Position-sensitive
  | "POKER_EDGE_RANK"        // reel 1 rank == reel 5 rank
  | "POKER_SPLIT_PAIR"       // X?X in any 3-card window: [0-2],[1-3],[2-4]
  | "POKER_ADJ_FACE"         // two or more adjacent face cards
  // Exact-count variants (stricter — prevent higher combos from also matching)
  | "POKER_SUIT_EXACT"       // exactly N cards of a given suit (not ≤ or ≥)
  | "POKER_FACE_EXACT"       // exactly N face cards
  | "POKER_LOW_EXACT"        // exactly N low cards
  | "POKER_EXACT_PAIR"       // exactly one pair (not two-pair, not trips+)
  | "POKER_ADJ_FACE_EXACT"   // exactly 2 face cards total AND they are adjacent
  | "POKER_TWO_PAIR_STRICT"; // exactly 2 pairs, NOT full house

export interface CardDef {
  id: string;
  tier: CardTier;
  name: string;
  description: string;
  payoutMult: number;
  pattern: {
    type: CardPatternType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: Record<string, any>;
  };
}
