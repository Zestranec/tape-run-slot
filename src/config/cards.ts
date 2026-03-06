import { CardDef } from "../types/CardTypes";

export const CARDS: CardDef[] = [
  // ── TIER 1 — payout only, no +action ─────────────────────────────────────────

  {
    id: "t1_red_pair",
    tier: 1,
    name: "Red Pair",
    description: "Exactly 2 Hearts",
    payoutMult: 0.016,
    pattern: { type: "POKER_SUIT_EXACT", params: { suit: "hearts", count: 2 } },
  },
  {
    id: "t1_black_pair",
    tier: 1,
    name: "Black Pair",
    description: "Exactly 2 Spades",
    payoutMult: 0.016,
    pattern: { type: "POKER_SUIT_EXACT", params: { suit: "spades", count: 2 } },
  },
  {
    id: "t1_face_pair",
    tier: 1,
    name: "Face Pair",
    description: "Exactly 2 face cards",
    payoutMult: 0.020,
    pattern: { type: "POKER_FACE_EXACT", params: { count: 2 } },
  },
  {
    id: "t1_low_pair",
    tier: 1,
    name: "Low Pair",
    description: "Exactly 2 low cards",
    payoutMult: 0.020,
    pattern: { type: "POKER_LOW_EXACT", params: { count: 2 } },
  },
  {
    id: "t1_match_ends",
    tier: 1,
    name: "Match Ends",
    description: "Reel 1 + 5 same rank",
    payoutMult: 0.024,
    pattern: { type: "POKER_EDGE_RANK", params: {} },
  },
  {
    id: "t1_twin_rank",
    tier: 1,
    name: "Twin Rank",
    description: "Exactly one pair",
    payoutMult: 0.030,
    pattern: { type: "POKER_EXACT_PAIR", params: {} },
  },
  {
    id: "t1_split_pair",
    tier: 1,
    name: "Split Pair",
    description: "X ? X in any 3-wide window",
    payoutMult: 0.020,
    pattern: { type: "POKER_SPLIT_PAIR", params: {} },
  },
  {
    id: "t1_two_faces_row",
    tier: 1,
    name: "Faces in a Row",
    description: "Exactly 2 adjacent faces",
    payoutMult: 0.021,
    pattern: { type: "POKER_ADJ_FACE_EXACT", params: {} },
  },

  // ── TIER 2 — payout only, no +action ─────────────────────────────────────────

  {
    id: "t2_three_kind",
    tier: 2,
    name: "Three of a Kind",
    description: "Three same rank",
    payoutMult: 0.021,
    pattern: { type: "POKER_THREE_KIND", params: {} },
  },
  {
    id: "t2_two_pair",
    tier: 2,
    name: "Two Pair",
    description: "Two different pairs",
    payoutMult: 0.026,
    pattern: { type: "POKER_TWO_PAIR_STRICT", params: {} },
  },
  {
    id: "t2_red_trio",
    tier: 2,
    name: "Red Trio",
    description: "Exactly 3 Hearts",
    payoutMult: 0.040,
    pattern: { type: "POKER_SUIT_EXACT", params: { suit: "hearts", count: 3 } },
  },
  {
    id: "t2_black_trio",
    tier: 2,
    name: "Black Trio",
    description: "Exactly 3 Spades",
    payoutMult: 0.040,
    pattern: { type: "POKER_SUIT_EXACT", params: { suit: "spades", count: 3 } },
  },
  {
    id: "t2_mini_straight",
    tier: 2,
    name: "Mini Straight",
    description: "Any 3-card straight",
    payoutMult: 0.050,
    pattern: { type: "POKER_MINI_STRAIGHT", params: {} },
  },
  {
    id: "t2_face_trio",
    tier: 2,
    name: "Face Trio",
    description: "Exactly 3 face cards",
    payoutMult: 0.045,
    pattern: { type: "POKER_FACE_EXACT", params: { count: 3 } },
  },

  // ── TIER 3 — payout + 1 action ────────────────────────────────────────────────

  {
    id: "t3_straight",
    tier: 3,
    name: "Straight",
    description: "5-card straight",
    payoutMult: 0.080,
    pattern: { type: "POKER_STRAIGHT", params: {} },
  },
  {
    id: "t3_flush",
    tier: 3,
    name: "Flush",
    description: "All 5 same suit",
    payoutMult: 0.230,
    pattern: { type: "POKER_FLUSH", params: {} },
  },
  {
    id: "t3_full_house",
    tier: 3,
    name: "Full House",
    description: "3 of one + 2 of another",
    payoutMult: 0.200,
    pattern: { type: "POKER_FULL_HOUSE", params: {} },
  },
  {
    id: "t3_four_kind",
    tier: 3,
    name: "Four of a Kind",
    description: "Four same rank",
    payoutMult: 0.420,
    pattern: { type: "POKER_FOUR_KIND", params: {} },
  },

  // ── TIER 4 — payout + 1 action ────────────────────────────────────────────────

  {
    id: "t4_straight_flush",
    tier: 4,
    name: "Straight Flush",
    description: "Straight + all same suit",
    payoutMult: 2.250,
    pattern: { type: "POKER_STRAIGHT_FLUSH", params: {} },
  },
  {
    id: "t4_five_kind",
    tier: 4,
    name: "Five of a Kind",
    description: "Five same rank",
    payoutMult: 9.000,
    pattern: { type: "POKER_FIVE_KIND", params: {} },
  },
];
