/**
 * SimRunner — core simulation engine.
 *
 * Design goals
 * ────────────
 * • ZERO PixiJS imports.  Reuses only the pure game-logic modules:
 *     RNG, CARDS, isCardSatisfied, RunController.
 * • Tape generation is an inline port of TapeSlotModel + TapeReel.generate
 *   using the identical RNG call sequence — results are bit-for-bit identical
 *   to what the browser game generates for the same seed.
 * • Spin outcome seed formula matches SpinController exactly:
 *     new RNG(runSeed * 31337 + spinCount)
 * • All per-run state lives in pre-allocated arrays that are overwritten each
 *   run, keeping GC pressure near zero for 1 M+ run simulations.
 */

import { RNG }              from "../core/RNG";
import { CARDS }            from "../config/cards";
import { CardDef }          from "../types/CardTypes";
import { isCardSatisfied }  from "../game/CardEvaluator";
import { RunController }    from "../game/RunController";
import {
  Policy,
  wrap,
  computeDigits,
  chooseCard,
  chooseCardRandom,
  findBestNudge,
} from "./BotStrategy";

// ── Constants (mirrors TapeSlotModel / SpinController) ──────────────────────
const REEL_COUNT = 7;
const TAPE_LEN   = 30; // DEFAULT_TAPE_LENGTH

// ── Public types ─────────────────────────────────────────────────────────────

export type { Policy };

export interface SimConfig {
  runs:       number;
  bet:        number;
  ante:       boolean;
  policy:     Policy;
  seedStart:  number;
  sampleSize: number;
  /** Optional git commit hash to embed in the report. */
  gitCommit?: string;
}

/** Per-run statistics saved for the CSV sample. */
export interface RunResult {
  runIndex:            number;
  seed:                number;
  bet:                 number;
  ante:                boolean;
  totalBet:            number;
  totalWin:            number;
  profit:              number;
  spins:               number;
  nudges:              number;
  actionsUsed:         number;
  cardsClaimed:        number;
  maxSingleCardMult:   number;
  endedByActionsZero:  boolean;
}

export interface CardStat {
  id:                      string;
  tier:                    number;
  payoutMult:              number;
  availableCount:          number;
  claimedCount:            number;
  totalPayoutContribution: number;
}

export interface WinBucket {
  label:      string;
  minMult:    number;
  maxMult:    number;
  count:      number;
  percentage: number;
}

export interface SimReport {
  metadata: {
    date:      string;
    gitCommit: string;
    runs:      number;
    bet:       number;
    ante:      boolean;
    policy:    Policy;
    seedStart: number;
  };
  totals: {
    totalBet:  number;
    totalWin:  number;
    rtp:       number;
    avgWin:    number;
    avgProfit: number;
  };
  perRunStats: {
    avgSpinsPerRun:  number;
    avgNudgesPerRun: number;
    avgActionsUsed:  number;
    p50Win:          number;
    p90Win:          number;
    p99Win:          number;
    maxWin:          number;
    hitRate:         number;
  };
  cardStats:  CardStat[];
  winBuckets: WinBucket[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Generate all 7 tapes for a given seed.
 *
 * Exactly mirrors TapeSlotModel.rebuildFromSeed():
 *   const rng = new RNG(seed);
 *   for 7 reels: TapeReel.generate(rng, 30)
 *
 * TapeReel.generate logic: pick a digit 1-9 from RNG; retry if it would
 * create 3+ identical in a row (up to 50 attempts).
 */
function generateTapes(seed: number, out: number[][]): void {
  const rng = new RNG(seed);
  for (let ri = 0; ri < REEL_COUNT; ri++) {
    const tape = out[ri];
    for (let i = 0; i < TAPE_LEN; i++) {
      let digit = 0;
      let attempts = 0;
      do {
        digit = rng.nextInt(1, 9);
        attempts++;
      } while (
        i >= 2 &&
        tape[i - 1] === digit &&
        tape[i - 2] === digit &&
        attempts < 50
      );
      tape[i] = digit;
    }
  }
}

/** Round a value to N decimal places. */
function round(n: number, places = 4): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

// ── Win buckets (expressed as multiples of bet) ───────────────────────────────
const BUCKET_EDGES  = [0, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0, 25.0, 50.0, Infinity];
const BUCKET_LABELS = [
  "0x",        "0.1x–0.2x", "0.2x–0.5x", "0.5x–1x",
  "1x–2x",     "2x–5x",     "5x–10x",    "10x–25x",
  "25x–50x",   "50x+",
];

function bucketIndex(winMult: number): number {
  for (let b = BUCKET_EDGES.length - 2; b >= 0; b--) {
    if (winMult >= BUCKET_EDGES[b]) return b;
  }
  return 0;
}

// ── Main simulation entry point ───────────────────────────────────────────────

export function runSimulation(
  config:      SimConfig,
  onProgress?: (done: number, total: number) => void,
): { report: SimReport; sample: RunResult[] } {

  const { runs, bet, ante, policy, seedStart, sampleSize } = config;
  const startActions   = ante ? RunController.ANTE_ACTIONS : RunController.DEFAULT_ACTIONS;
  const totalBetPerRun = bet * (ante ? 1.25 : 1.0);

  // ── Pre-allocated, reused across all runs ───────────────────────────────────
  const tapes:   number[][] = Array.from({ length: REEL_COUNT }, () => new Array(TAPE_LEN).fill(0));
  const offsets: number[]   = new Array(REEL_COUNT).fill(0);
  const digits:  number[]   = new Array(REEL_COUNT).fill(0);
  const claimedIds: Set<string> = new Set();

  // Shared RunController — configure once, resetRun() each run.
  const run = new RunController();
  run.configure(ante);

  // ── Global accumulators ─────────────────────────────────────────────────────
  let grandTotalBet    = 0;
  let grandTotalWin    = 0;
  let totalSpins       = 0;
  let totalNudges      = 0;
  let totalActionsUsed = 0;
  let totalHits        = 0;

  // Sorted later for percentiles — pre-allocated.
  const allWins = new Float64Array(runs);

  const cardStatsMap = new Map<string, CardStat>();
  for (const c of CARDS) {
    cardStatsMap.set(c.id, {
      id: c.id, tier: c.tier, payoutMult: c.payoutMult,
      availableCount: 0, claimedCount: 0, totalPayoutContribution: 0,
    });
  }

  const bucketCounts = new Array<number>(BUCKET_LABELS.length).fill(0);

  const sample: RunResult[] = [];
  const progressInterval = Math.max(1, Math.floor(runs / 20));

  // ── Run loop ─────────────────────────────────────────────────────────────────
  for (let ri = 0; ri < runs; ri++) {
    const seed = seedStart + ri;

    // Build tapes from this run's seed (same generation logic as TapeSlotModel).
    generateTapes(seed, tapes);

    // Reset per-run mutable state.
    offsets.fill(0);
    claimedIds.clear();
    run.resetRun();

    // Decision RNG — seeded independently from spin RNGs so that choosing
    // a random card never perturbs the spin-outcome sequence.
    // XOR constant 0x9E3779B9 (golden-ratio fractional part) provides a
    // well-mixed seed that is deterministic and unique per run.
    const decisionRng = policy === "random" ? new RNG(seed ^ 0x9E3779B9) : null;

    let spinCount       = 0;
    let runWin          = 0;
    let runSpins        = 0;
    let runNudges       = 0;
    let runActionsUsed  = 0;
    let runCardsClaimed = 0;
    let runMaxMult      = 0;

    // ── Inner run loop ─────────────────────────────────────────────────────────
    while (run.actions > 0) {
      // ── SPIN ────────────────────────────────────────────────────────────────
      spinCount++;
      run.spend(1);
      runActionsUsed++;
      runSpins++;

      // Spin RNG: identical formula to SpinController.requestSpin().
      // Fresh RNG per spin — never shares state with decisionRng.
      const spinRng = new RNG(seed * 31337 + spinCount);
      for (let i = 0; i < REEL_COUNT; i++) {
        const rawDelta = spinRng.nextInt(1, TAPE_LEN - 1);
        // Bot never locks reels → all deltas are applied.
        offsets[i] = wrap(offsets[i] + rawDelta, TAPE_LEN);
      }
      computeDigits(tapes, offsets, TAPE_LEN, digits);

      // ── EVALUATE after spin ─────────────────────────────────────────────────
      const available = collectAvailable(digits, claimedIds, cardStatsMap);

      if (available.length > 0) {
        const chosen = decisionRng !== null
          ? chooseCardRandom(available, decisionRng)
          : chooseCard(available);
        performClaim(chosen, bet, run, claimedIds, cardStatsMap,
          (payout, mult) => { runWin += payout; runMaxMult = Math.max(runMaxMult, mult); runCardsClaimed++; });
        continue; // proceed to next spin
      }

      // ── SMART NUDGE (baseline skips this block entirely) ───────────────────
      if (policy === "smart") {
        const nudgeCost = run.getNudgeCost();
        if (nudgeCost <= 2 && run.canSpend(nudgeCost)) {
          const nudge = findBestNudge(tapes, offsets, TAPE_LEN, claimedIds);
          if (nudge !== null) {
            offsets[nudge.reelIdx] = wrap(offsets[nudge.reelIdx] + nudge.delta, TAPE_LEN);
            run.spend(nudgeCost);
            run.recordNudge();
            runActionsUsed += nudgeCost;
            runNudges++;

            // Re-evaluate after nudge.
            computeDigits(tapes, offsets, TAPE_LEN, digits);
            const avail2 = collectAvailable(digits, claimedIds, cardStatsMap);
            if (avail2.length > 0) {
              const chosen2 = decisionRng !== null
                ? chooseCardRandom(avail2, decisionRng)
                : chooseCard(avail2);
              performClaim(chosen2, bet, run, claimedIds, cardStatsMap,
                (payout, mult) => { runWin += payout; runMaxMult = Math.max(runMaxMult, mult); runCardsClaimed++; });
            }
          }
        }
      }
    } // end inner run loop

    // ── Aggregate ──────────────────────────────────────────────────────────────
    grandTotalBet    += totalBetPerRun;
    grandTotalWin    += runWin;
    totalSpins       += runSpins;
    totalNudges      += runNudges;
    totalActionsUsed += runActionsUsed;
    if (runWin > 0) totalHits++;
    allWins[ri] = runWin;
    bucketCounts[bucketIndex(runWin / bet)]++;

    if (ri < sampleSize) {
      sample.push({
        runIndex:           ri,
        seed,
        bet,
        ante,
        totalBet:           totalBetPerRun,
        totalWin:           round(runWin, 4),
        profit:             round(runWin - totalBetPerRun, 4),
        spins:              runSpins,
        nudges:             runNudges,
        actionsUsed:        runActionsUsed,
        cardsClaimed:       runCardsClaimed,
        maxSingleCardMult:  runMaxMult,
        endedByActionsZero: run.actions === 0,
      });
    }

    if (onProgress && (ri + 1) % progressInterval === 0) {
      onProgress(ri + 1, runs);
    }
  }

  // ── Percentiles ────────────────────────────────────────────────────────────
  // Use a copy so we don't mutate allWins (used in buckets already).
  const sorted = allWins.slice().sort();
  const p50Win = sorted[Math.floor(runs * 0.50)];
  const p90Win = sorted[Math.floor(runs * 0.90)];
  const p99Win = sorted[Math.floor(runs * 0.99)];
  const maxWin = sorted[runs - 1];

  const rtp       = grandTotalWin / grandTotalBet;
  const avgWin    = grandTotalWin / runs;
  const avgProfit = (grandTotalWin - grandTotalBet) / runs;

  // ── Build report ─────────────────────────────────────────────────────────
  const report: SimReport = {
    metadata: {
      date:      new Date().toISOString(),
      gitCommit: config.gitCommit ?? "unknown",
      runs,
      bet,
      ante,
      policy,
      seedStart,
    },
    totals: {
      totalBet:  round(grandTotalBet,  2),
      totalWin:  round(grandTotalWin,  2),
      rtp:       round(rtp,            4),
      avgWin:    round(avgWin,         4),
      avgProfit: round(avgProfit,      4),
    },
    perRunStats: {
      avgSpinsPerRun:  round(totalSpins       / runs, 2),
      avgNudgesPerRun: round(totalNudges      / runs, 2),
      avgActionsUsed:  round(totalActionsUsed / runs, 2),
      p50Win: round(p50Win, 2),
      p90Win: round(p90Win, 2),
      p99Win: round(p99Win, 2),
      maxWin: round(maxWin, 2),
      hitRate: round(totalHits / runs, 4),
    },
    cardStats: Array.from(cardStatsMap.values()),
    winBuckets: BUCKET_LABELS.map((label, i) => ({
      label,
      minMult:    BUCKET_EDGES[i],
      maxMult:    BUCKET_EDGES[i + 1] === Infinity ? Infinity : BUCKET_EDGES[i + 1],
      count:      bucketCounts[i],
      percentage: round((bucketCounts[i] / runs) * 100, 2),
    })),
  };

  return { report, sample };
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Evaluate all unclaimed cards against the current digit row.
 * Increments `availableCount` stats for each matching card.
 */
function collectAvailable(
  digits:       number[],
  claimedIds:   ReadonlySet<string>,
  cardStatsMap: Map<string, CardStat>,
): CardDef[] {
  const out: CardDef[] = [];
  for (const card of CARDS) {
    if (!claimedIds.has(card.id) && isCardSatisfied(card, digits)) {
      out.push(card);
      cardStatsMap.get(card.id)!.availableCount++;
    }
  }
  return out;
}

/**
 * Perform one card claim.  Updates RunController (action bonus for Tier 2+),
 * claimedIds, cardStats, and calls `onResult` with (payout, mult).
 */
function performClaim(
  card:         CardDef,
  bet:          number,
  run:          RunController,
  claimedIds:   Set<string>,
  cardStatsMap: Map<string, CardStat>,
  onResult:     (payout: number, mult: number) => void,
): void {
  const payout = bet * card.payoutMult;
  claimedIds.add(card.id);
  if (card.tier >= 2) run.addActions(1);

  const cs = cardStatsMap.get(card.id)!;
  cs.claimedCount++;
  cs.totalPayoutContribution += payout;

  onResult(payout, card.payoutMult);
}
