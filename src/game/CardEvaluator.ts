import { CardDef } from "../types/CardTypes";

/**
 * Pure function: returns true if the given 7-digit row satisfies the card's
 * pattern. No state, no RNG — only depends on visible digits.
 */
export function isCardSatisfied(card: CardDef, digits: number[]): boolean {
  const { type, params } = card.pattern;

  switch (type) {
    case "ANY_DIGIT_AT_LEAST": {
      // At least `count` occurrences of `digit`
      const found = digits.filter(d => d === params.digit).length;
      return found >= (params.count as number);
    }

    case "ANY_OF_SET": {
      // At least `count` digits that belong to the given set
      const set = params.digits as number[];
      const found = digits.filter(d => set.includes(d)).length;
      return found >= (params.count as number);
    }

    case "ADJACENT_EQUAL": {
      // Any run of exactly `length` consecutive equal digits (or more)
      const len = params.length as number;
      for (let i = 0; i <= digits.length - len; i++) {
        let ok = true;
        for (let j = 1; j < len; j++) {
          if (digits[i + j] !== digits[i]) { ok = false; break; }
        }
        if (ok) return true;
      }
      return false;
    }

    case "ADJACENT_PARITY": {
      // Any two adjacent digits with the same parity
      const wantOdd = (params.parity as string) === "odd";
      const matches = (n: number) => wantOdd ? n % 2 === 1 : n % 2 === 0;
      for (let i = 0; i < digits.length - 1; i++) {
        if (matches(digits[i]) && matches(digits[i + 1])) return true;
      }
      return false;
    }

    case "EDGE_MATCH":
      return digits[0] === digits[digits.length - 1];

    case "MASK_MATCH": {
      // Slide the mask over all possible positions; '_' is a wildcard
      const mask = params.mask as string;
      for (let start = 0; start <= digits.length - mask.length; start++) {
        let ok = true;
        for (let j = 0; j < mask.length; j++) {
          if (mask[j] !== "_" && Number(mask[j]) !== digits[start + j]) {
            ok = false;
            break;
          }
        }
        if (ok) return true;
      }
      return false;
    }

    case "RUN_SEQUENCE": {
      // Any `length` consecutive digits forming an ascending or descending
      // arithmetic sequence with step 1 (e.g. 123 or 321)
      const len = params.length as number;
      for (let i = 0; i <= digits.length - len; i++) {
        let asc = true;
        let desc = true;
        for (let j = 1; j < len; j++) {
          if (digits[i + j] !== digits[i] + j) asc  = false;
          if (digits[i + j] !== digits[i] - j) desc = false;
          if (!asc && !desc) break;
        }
        if (asc || desc) return true;
      }
      return false;
    }

    case "COUNT_CONDITION": {
      // Count digits that satisfy the condition; must be >= params.count
      let count = 0;
      for (const d of digits) {
        let ok = true;
        if (params.minDigit !== undefined) ok = ok && d >= (params.minDigit as number);
        if (params.maxDigit !== undefined) ok = ok && d <= (params.maxDigit as number);
        if (ok) count++;
      }
      return count >= (params.count as number);
    }

    case "TWO_PAIRS": {
      // Any 4 consecutive digits forming aabb or abba
      for (let i = 0; i <= digits.length - 4; i++) {
        const [a, b, c, d] = [digits[i], digits[i + 1], digits[i + 2], digits[i + 3]];
        if (a === b && c === d) return true; // aabb
        if (a === d && b === c) return true; // abba
      }
      return false;
    }

    case "EXACT_RUN": {
      // Any `length` consecutive positions all equal to `digit`
      const { digit, length } = params as { digit: number; length: number };
      for (let i = 0; i <= digits.length - length; i++) {
        let ok = true;
        for (let j = 0; j < length; j++) {
          if (digits[i + j] !== digit) { ok = false; break; }
        }
        if (ok) return true;
      }
      return false;
    }

    case "PALINDROME_7":
      // d[0]=d[6], d[1]=d[5], d[2]=d[4]; d[3] is free (abcxcba)
      return (
        digits.length >= 7 &&
        digits[0] === digits[6] &&
        digits[1] === digits[5] &&
        digits[2] === digits[4]
      );

    case "ALL_DISTINCT_7":
      // All 7 digits are different from one another
      return new Set(digits).size === digits.length;

    default:
      console.warn(`[CardEvaluator] Unknown pattern type: ${type}`);
      return false;
  }
}
