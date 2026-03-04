export type CardTier = 1 | 2 | 3 | 4;

export type CardPatternType =
  | "ANY_DIGIT_AT_LEAST"
  | "ANY_OF_SET"
  | "ADJACENT_EQUAL"
  | "ADJACENT_PARITY"
  | "EDGE_MATCH"
  | "MASK_MATCH"
  | "RUN_SEQUENCE"
  | "COUNT_CONDITION"
  | "TWO_PAIRS"
  | "EXACT_RUN"
  | "PALINDROME_7"
  | "ALL_DISTINCT_7";

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
