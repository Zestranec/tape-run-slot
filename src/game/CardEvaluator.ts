import { CardDef } from "../types/CardTypes";

// ── Distance-aware evaluation ──────────────────────────────────────────────────

export interface CardEvalResult {
  matched:  boolean;
  /**
   * 0 → pattern satisfied.
   * 1 → one digit change would satisfy it.
   * 2+ → further away (not highlighted as "almost").
   */
  distance: number;
}

/**
 * Returns both a matched flag and a minimum-edit distance.
 * `isCardSatisfied` is kept unchanged so the simulation is unaffected.
 */
export function evaluateCard(card: CardDef, digits: number[]): CardEvalResult {
  const distance = computeDistance(card, digits);
  return { matched: distance === 0, distance };
}

function computeDistance(card: CardDef, digits: number[]): number {
  const { type, params } = card.pattern;

  switch (type) {
    // ── ANY_DIGIT_AT_LEAST ────────────────────────────────────────────────────
    case "ANY_DIGIT_AT_LEAST": {
      const found = digits.filter(d => d === params.digit).length;
      return Math.max(0, (params.count as number) - found);
    }

    // ── ANY_OF_SET ────────────────────────────────────────────────────────────
    case "ANY_OF_SET": {
      const set   = params.digits as number[];
      const found = digits.filter(d => set.includes(d)).length;
      return Math.max(0, (params.count as number) - found);
    }

    // ── ADJACENT_EQUAL ────────────────────────────────────────────────────────
    // Distance for a window = (window_length - frequency of the most common
    // digit in that window).  Take the minimum over all windows.
    case "ADJACENT_EQUAL": {
      const len = params.length as number;
      let best = len; // worst case: change every digit
      for (let i = 0; i <= digits.length - len; i++) {
        const freq: Record<number, number> = {};
        for (let j = 0; j < len; j++) {
          const d = digits[i + j];
          freq[d] = (freq[d] ?? 0) + 1;
        }
        const maxFreq = Math.max(...Object.values(freq));
        best = Math.min(best, len - maxFreq);
      }
      return best;
    }

    // ── ADJACENT_PARITY ───────────────────────────────────────────────────────
    // Already matched if any adjacent pair both have the target parity.
    // Otherwise 1 change always suffices (flip one digit to form a pair).
    case "ADJACENT_PARITY": {
      const wantOdd = (params.parity as string) === "odd";
      const matches = (n: number) => wantOdd ? n % 2 === 1 : n % 2 === 0;
      for (let i = 0; i < digits.length - 1; i++) {
        if (matches(digits[i]) && matches(digits[i + 1])) return 0;
      }
      return 1; // changing any digit to correct parity creates a pair
    }

    // ── EDGE_MATCH ────────────────────────────────────────────────────────────
    case "EDGE_MATCH":
      return digits[0] === digits[digits.length - 1] ? 0 : 1;

    // ── MASK_MATCH ────────────────────────────────────────────────────────────
    // Count non-wildcard mismatches per window; take minimum.
    case "MASK_MATCH": {
      const mask = params.mask as string;
      let best = mask.length;
      for (let start = 0; start <= digits.length - mask.length; start++) {
        let mismatches = 0;
        for (let j = 0; j < mask.length; j++) {
          if (mask[j] !== "_" && Number(mask[j]) !== digits[start + j]) mismatches++;
        }
        best = Math.min(best, mismatches);
      }
      return best;
    }

    // ── RUN_SEQUENCE ──────────────────────────────────────────────────────────
    // For each window compute how many digits need to change to form a
    // perfect ascending or descending run.  Use offset-method for asc/desc:
    //   asc key = digit[i] - i   (constant in a perfect ascending run)
    //   desc key = digit[i] + i  (constant in a perfect descending run)
    // Distance = window_length - frequency of modal key.
    case "RUN_SEQUENCE": {
      const len = params.length as number;
      let best = len;
      for (let i = 0; i <= digits.length - len; i++) {
        const ascFreq:  Record<number, number> = {};
        const descFreq: Record<number, number> = {};
        for (let j = 0; j < len; j++) {
          const d = digits[i + j];
          const ak = d - j;
          const dk = d + j;
          ascFreq[ak]  = (ascFreq[ak]  ?? 0) + 1;
          descFreq[dk] = (descFreq[dk] ?? 0) + 1;
        }
        const maxAsc  = Math.max(...Object.values(ascFreq));
        const maxDesc = Math.max(...Object.values(descFreq));
        best = Math.min(best, len - Math.max(maxAsc, maxDesc));
      }
      return best;
    }

    // ── COUNT_CONDITION ───────────────────────────────────────────────────────
    case "COUNT_CONDITION": {
      let count = 0;
      for (const d of digits) {
        let ok = true;
        if (params.minDigit !== undefined) ok = ok && d >= (params.minDigit as number);
        if (params.maxDigit !== undefined) ok = ok && d <= (params.maxDigit as number);
        if (ok) count++;
      }
      return Math.max(0, (params.count as number) - count);
    }

    // ── TWO_PAIRS ─────────────────────────────────────────────────────────────
    // For aabb: need d[0]==d[1] AND d[2]==d[3]. Cost = (d0≠d1?1:0) + (d2≠d3?1:0).
    // For abba: need d[0]==d[3] AND d[1]==d[2]. Cost = (d0≠d3?1:0) + (d1≠d2?1:0).
    case "TWO_PAIRS": {
      let best = 2;
      for (let i = 0; i <= digits.length - 4; i++) {
        const [a, b, c, d] = [digits[i], digits[i+1], digits[i+2], digits[i+3]];
        const aabb = (a !== b ? 1 : 0) + (c !== d ? 1 : 0);
        const abba = (a !== d ? 1 : 0) + (b !== c ? 1 : 0);
        best = Math.min(best, aabb, abba);
      }
      return best;
    }

    // ── EXACT_RUN ─────────────────────────────────────────────────────────────
    // Count positions that are NOT the required digit per window.
    case "EXACT_RUN": {
      const { digit, length } = params as { digit: number; length: number };
      let best = length;
      for (let i = 0; i <= digits.length - length; i++) {
        let mismatches = 0;
        for (let j = 0; j < length; j++) {
          if (digits[i + j] !== digit) mismatches++;
        }
        best = Math.min(best, mismatches);
      }
      return best;
    }

    // ── PALINDROME_7 ──────────────────────────────────────────────────────────
    // Mismatched mirrored pairs: (0,6), (1,5), (2,4).
    case "PALINDROME_7": {
      if (digits.length < 7) return 3;
      let dist = 0;
      if (digits[0] !== digits[6]) dist++;
      if (digits[1] !== digits[5]) dist++;
      if (digits[2] !== digits[4]) dist++;
      return dist;
    }

    // ── ALL_DISTINCT_7 ────────────────────────────────────────────────────────
    // Number of "extra" copies = total - distinct count.
    case "ALL_DISTINCT_7":
      return digits.length - new Set(digits).size;

    default:
      return 99;
  }
}

// ── Boolean helper — unchanged (used by simulation) ───────────────────────────

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

// ── Near-miss reel hint ────────────────────────────────────────────────────────

export interface NearMissHint {
  /** Zero-based reel indices that need to change. */
  reels:    number[];
  /** The digit that would satisfy the pattern at those reels, if determinable. */
  wanted?: number;
}

/**
 * Returns a reel-level hint when `card` is exactly distance=1 from being
 * satisfied by `digits`.  Returns null if the pattern type does not support
 * reel-level hints (to avoid noisy/unclear feedback).
 *
 * Supported: MASK_MATCH · EDGE_MATCH · EXACT_RUN · ADJACENT_EQUAL · RUN_SEQUENCE
 */
export function getNearMissHint(
  card: CardDef,
  digits: number[],
): NearMissHint | null {
  const { type, params } = card.pattern;

  switch (type) {

    // ── EDGE_MATCH ─────────────────────────────────────────────────────────────
    case "EDGE_MATCH": {
      if (digits[0] === digits[digits.length - 1]) return null; // already matched
      // Suggest changing the last reel to match the first.
      return { reels: [0, digits.length - 1], wanted: digits[0] };
    }

    // ── EXACT_RUN ──────────────────────────────────────────────────────────────
    case "EXACT_RUN": {
      const { digit, length } = params as { digit: number; length: number };
      for (let i = 0; i <= digits.length - length; i++) {
        const wrong: number[] = [];
        for (let j = 0; j < length; j++) {
          if (digits[i + j] !== digit) wrong.push(i + j);
        }
        if (wrong.length === 1) return { reels: wrong, wanted: digit };
      }
      return null;
    }

    // ── ADJACENT_EQUAL ─────────────────────────────────────────────────────────
    case "ADJACENT_EQUAL": {
      const len = params.length as number;
      for (let i = 0; i <= digits.length - len; i++) {
        // Find the most common digit in the window.
        const freq = new Map<number, number>();
        for (let j = 0; j < len; j++) {
          const d = digits[i + j];
          freq.set(d, (freq.get(d) ?? 0) + 1);
        }
        let maxFreq = 0, modeVal = 0;
        for (const [val, cnt] of freq) {
          if (cnt > maxFreq) { maxFreq = cnt; modeVal = val; }
        }
        if (len - maxFreq === 1) {
          // Exactly one reel differs from the mode.
          let wrongJ = -1;
          for (let j = 0; j < len; j++) {
            if (digits[i + j] !== modeVal) { wrongJ = j; break; }
          }
          if (wrongJ >= 0) return { reels: [i + wrongJ], wanted: modeVal };
        }
      }
      return null;
    }

    // ── MASK_MATCH ─────────────────────────────────────────────────────────────
    case "MASK_MATCH": {
      const mask = params.mask as string;
      for (let start = 0; start <= digits.length - mask.length; start++) {
        let wrongReel = -1;
        let wantedDigit = -1;
        let mismatch = 0;
        for (let j = 0; j < mask.length; j++) {
          if (mask[j] !== "_" && Number(mask[j]) !== digits[start + j]) {
            mismatch++;
            wrongReel   = start + j;
            wantedDigit = Number(mask[j]);
          }
        }
        if (mismatch === 1) return { reels: [wrongReel], wanted: wantedDigit };
      }
      return null;
    }

    // ── RUN_SEQUENCE ───────────────────────────────────────────────────────────
    // key trick: in a perfect ascending run, (digit - j) is constant.
    // In a perfect descending run, (digit + j) is constant.
    // The mode of these keys tells us the best starting value; any position
    // where the key differs is the one that needs to change.
    case "RUN_SEQUENCE": {
      const len = params.length as number;
      for (let i = 0; i <= digits.length - len; i++) {
        // Ascending
        const ascFreq = new Map<number, number>();
        for (let j = 0; j < len; j++) {
          const k = digits[i + j] - j;
          ascFreq.set(k, (ascFreq.get(k) ?? 0) + 1);
        }
        let ascMax = 0, ascMode = 0;
        for (const [k, cnt] of ascFreq) {
          if (cnt > ascMax) { ascMax = cnt; ascMode = k; }
        }
        if (len - ascMax === 1) {
          for (let j = 0; j < len; j++) {
            if (digits[i + j] - j !== ascMode) {
              return { reels: [i + j], wanted: ascMode + j };
            }
          }
        }

        // Descending
        const descFreq = new Map<number, number>();
        for (let j = 0; j < len; j++) {
          const k = digits[i + j] + j;
          descFreq.set(k, (descFreq.get(k) ?? 0) + 1);
        }
        let descMax = 0, descMode = 0;
        for (const [k, cnt] of descFreq) {
          if (cnt > descMax) { descMax = cnt; descMode = k; }
        }
        if (len - descMax === 1) {
          for (let j = 0; j < len; j++) {
            if (digits[i + j] + j !== descMode) {
              return { reels: [i + j], wanted: descMode - j };
            }
          }
        }
      }
      return null;
    }

    default:
      return null;
  }
}
