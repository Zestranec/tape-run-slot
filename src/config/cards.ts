import { CardDef } from "../types/CardTypes";

export const CARDS: CardDef[] = [
  // ── TIER 1 — payout only, NO +action ────────────────────────────────────────

  {
    id: "t1_two_sevens",
    tier: 1,
    name: "Two Sevens",
    description: "At least two 7s anywhere",
    payoutMult: 0.07,
    pattern: { type: "ANY_DIGIT_AT_LEAST", params: { digit: 7, count: 2 } },
  },
  {
    id: "t1_two_ones",
    tier: 1,
    name: "Two Ones",
    description: "At least two 1s anywhere",
    payoutMult: 0.07,
    pattern: { type: "ANY_DIGIT_AT_LEAST", params: { digit: 1, count: 2 } },
  },
  {
    id: "t1_edge_match",
    tier: 1,
    name: "Edge Match",
    description: "First digit equals last digit",
    payoutMult: 0.05,
    pattern: { type: "EDGE_MATCH", params: {} },
  },
  {
    id: "t1_odd_pair",
    tier: 1,
    name: "Odd Pair",
    description: "Two adjacent odd digits",
    payoutMult: 0.05,
    pattern: { type: "ADJACENT_PARITY", params: { parity: "odd" } },
  },
  {
    id: "t1_even_pair",
    tier: 1,
    name: "Even Pair",
    description: "Two adjacent even digits",
    payoutMult: 0.05,
    pattern: { type: "ADJACENT_PARITY", params: { parity: "even" } },
  },
  {
    id: "t1_lucky_sandwich",
    tier: 1,
    name: "Lucky Sandwich",
    description: "7x7 in any 3-wide window",
    payoutMult: 0.05,
    pattern: { type: "MASK_MATCH", params: { mask: "7_7" } },
  },
  {
    id: "t1_double_nine",
    tier: 1,
    name: "Double Nine",
    description: "9 _ _ _ _ _ 9",
    payoutMult: 0.19,
    pattern: { type: "MASK_MATCH", params: { mask: "9_____9" } },
  },
  {
    id: "t1_double_low_edge",
    tier: 1,
    name: "Low Edge",
    description: "1 _ _ _ _ _ 2",
    payoutMult: 0.19,
    pattern: { type: "MASK_MATCH", params: { mask: "1_____2" } },
  },
  {
    id: "t1_triple_equal",
    tier: 1,
    name: "Triple Equal",
    description: "Three identical digits adjacent",
    payoutMult: 0.12,
    pattern: { type: "ADJACENT_EQUAL", params: { length: 3 } },
  },
  {
    id: "t1_two_pairs",
    tier: 1,
    name: "Two Pairs",
    description: "aabb or abba within any 4 adjacent",
    payoutMult: 0.14,
    pattern: { type: "TWO_PAIRS", params: {} },
  },
  {
    id: "t1_all_distinct",
    tier: 1,
    name: "All Distinct",
    description: "All seven digits are different",
    payoutMult: 0.19,
    pattern: { type: "ALL_DISTINCT_7", params: {} },
  },
  {
    id: "t1_high_trio_any",
    tier: 1,
    name: "High Trio",
    description: "At least three digits ≥ 8 anywhere",
    payoutMult: 0.23,
    pattern: { type: "COUNT_CONDITION", params: { minDigit: 8, count: 3 } },
  },

  // ── TIER 2 — payout + 1 action ───────────────────────────────────────────────

  {
    id: "t2_teeth",
    tier: 2,
    name: "Teeth",
    description: "1 _ _ _ _ _ 1",
    payoutMult: 0.23,
    pattern: { type: "MASK_MATCH", params: { mask: "1_____1" } },
  },
  {
    id: "t2_four_stairs",
    tier: 2,
    name: "Four Stairs",
    description: "4 adjacent ascending or descending",
    payoutMult: 0.34,
    pattern: { type: "RUN_SEQUENCE", params: { length: 4 } },
  },
  {
    id: "t2_777",
    tier: 2,
    name: "Exact 777",
    description: "777 adjacent",
    payoutMult: 0.47,
    pattern: { type: "EXACT_RUN", params: { digit: 7, length: 3 } },
  },
  {
    id: "t2_four_kind",
    tier: 2,
    name: "Four of a Kind",
    description: "Four identical digits adjacent",
    payoutMult: 0.56,
    pattern: { type: "ADJACENT_EQUAL", params: { length: 4 } },
  },
  {
    id: "t2_mirror",
    tier: 2,
    name: "Mirror 7",
    description: "abcxcba palindrome",
    payoutMult: 0.94,
    pattern: { type: "PALINDROME_7", params: {} },
  },

  // ── TIER 3 — payout + 1 action ───────────────────────────────────────────────

  {
    id: "t3_7777",
    tier: 3,
    name: "Seven Quad",
    description: "7777 adjacent",
    payoutMult: 2.56,
    pattern: { type: "EXACT_RUN", params: { digit: 7, length: 4 } },
  },
  {
    id: "t3_full_stairs",
    tier: 3,
    name: "Full Stairs",
    description: "1234567 or 7654321",
    payoutMult: 4.27,
    pattern: { type: "RUN_SEQUENCE", params: { length: 7 } },
  },

  // ── TIER 4 — payout + 1 action ───────────────────────────────────────────────

  {
    id: "t4_seven_heaven",
    tier: 4,
    name: "Seven Heaven",
    description: "7 7 7 7 7 7 7",
    payoutMult: 21.35,
    pattern: { type: "EXACT_RUN", params: { digit: 7, length: 7 } },
  },
];
