/**
 * scripts/simulate.ts — CLI entry point for the tape-run-slot simulation.
 *
 * Usage:
 *   npm run sim -- --runs=100000 --bet=10 --ante=0 --policy=baseline --seedStart=1
 *
 * Flags (all optional, defaults shown):
 *   --runs=100000          Number of runs to simulate.
 *   --bet=10               Bet amount in FUN (5 | 10 | 20 | 50).
 *   --ante=0               0 = no ante, 1 = ante (+25% bet, +3 actions).
 *   --policy=baseline      "baseline" | "random" | "smart"
 *   --seedStart=1          First run seed.  Run i gets seed = seedStart + i.
 *   --sample=5000          Rows to write to the sample CSV.
 *   --tag=                 Optional suffix appended to output filenames, e.g. --tag=step9
 *
 * Outputs (written to ./reports/, auto-named by policy + run count [+ tag]):
 *   sim_report_{policy}_{runsLabel}[_{tag}].json
 *   sim_runs_sample_{policy}[_{tag}].csv
 */

import { execSync }     from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join }         from "path";
import { runSimulation, SimConfig, SimReport } from "../src/sim/SimRunner.js";
import type { Policy }  from "../src/sim/BotStrategy.js";

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(): SimConfig & { _reportsDir: string; _tag: string } {
  const argv = process.argv.slice(2);

  function flag(name: string, defaultVal: string): string {
    const prefix = `--${name}=`;
    const found  = argv.find(a => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : defaultVal;
  }

  const runs      = Math.max(1,    parseInt(flag("runs",      "100000"), 10));
  const bet       = parseInt(flag("bet",       "10"),  10);
  const ante      = flag("ante",      "0") !== "0";
  const policy    = flag("policy",    "baseline") as Policy;
  const seedStart = Math.max(0,    parseInt(flag("seedStart", "1"),     10));
  const sample    = Math.max(1,    parseInt(flag("sample",    "5000"),  10));
  const tag       = flag("tag", "");

  if (!["baseline", "smart", "random"].includes(policy)) {
    console.error(`Unknown policy "${policy}". Use baseline, random, or smart.`);
    process.exit(1);
  }

  return { runs, bet, ante, policy, seedStart, sampleSize: sample, _reportsDir: "reports", _tag: tag };
}

// ── Git commit hash (best-effort) ─────────────────────────────────────────────

function getGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

// ── Output formatting ─────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function buildCsv(sample: ReturnType<typeof runSimulation>["sample"]): string {
  const header = [
    "runIndex","seed","bet","ante","totalBet","totalWin","profit",
    "spins","nudges","actionsUsed","cardsClaimed","maxSingleCardMult","endedByActionsZero",
  ].join(",");

  const rows = sample.map(r =>
    [
      r.runIndex, r.seed, r.bet, r.ante ? 1 : 0, r.totalBet,
      r.totalWin, r.profit, r.spins, r.nudges, r.actionsUsed,
      r.cardsClaimed, r.maxSingleCardMult, r.endedByActionsZero ? 1 : 0,
    ].join(",")
  );

  return [header, ...rows].join("\n");
}

function printSummary(report: SimReport, elapsedMs: number): void {
  const { totals, perRunStats } = report;
  const { metadata } = report;

  console.log("\n" + "═".repeat(60));
  console.log("  TAPE-RUN-SLOT SIMULATION RESULTS");
  console.log("═".repeat(60));
  console.log(`  Runs      : ${metadata.runs.toLocaleString()}`);
  console.log(`  Bet       : ${metadata.bet} FUN  |  Ante: ${metadata.ante ? "YES (+25%)" : "NO"}`);
  console.log(`  Policy    : ${metadata.policy}`);
  console.log(`  Seeds     : ${metadata.seedStart} – ${metadata.seedStart + metadata.runs - 1}`);
  console.log(`  Elapsed   : ${formatDuration(elapsedMs)}`);
  console.log("─".repeat(60));
  console.log(`  RTP       : ${(totals.rtp * 100).toFixed(2)}%`);
  console.log(`  Avg Win   : ${totals.avgWin.toFixed(2)} FUN`);
  console.log(`  Avg Profit: ${totals.avgProfit.toFixed(2)} FUN`);
  console.log(`  Hit Rate  : ${(perRunStats.hitRate * 100).toFixed(1)}%  (runs with win > 0)`);
  console.log("─".repeat(60));
  console.log(`  Max Win   : ${perRunStats.maxWin.toFixed(2)} FUN`);
  console.log(`  p99 Win   : ${perRunStats.p99Win.toFixed(2)} FUN`);
  console.log(`  p90 Win   : ${perRunStats.p90Win.toFixed(2)} FUN`);
  console.log(`  p50 Win   : ${perRunStats.p50Win.toFixed(2)} FUN`);
  console.log("─".repeat(60));
  console.log(`  Avg Spins : ${perRunStats.avgSpinsPerRun.toFixed(1)} per run`);
  console.log(`  Avg Nudges: ${perRunStats.avgNudgesPerRun.toFixed(2)} per run`);
  console.log(`  Avg Actions used: ${perRunStats.avgActionsUsed.toFixed(1)} per run`);
  console.log("─".repeat(60));
  console.log("  Win distribution (× bet):");
  for (const b of report.winBuckets) {
    const bar = "█".repeat(Math.round(b.percentage / 2));
    console.log(`    ${b.label.padEnd(14)} ${b.count.toLocaleString().padStart(8)}  (${b.percentage.toFixed(1)}%)  ${bar}`);
  }
  console.log("─".repeat(60));
  console.log("  Top 5 claimed cards:");
  const topCards = report.cardStats
    .filter(c => c.claimedCount > 0)
    .sort((a, b) => b.claimedCount - a.claimedCount)
    .slice(0, 5);
  for (const c of topCards) {
    const rtpContrib = (c.totalPayoutContribution / totals.totalBet * 100).toFixed(2);
    console.log(`    ${c.id.padEnd(20)}  claimed ${c.claimedCount.toLocaleString().padStart(8)}  RTP contrib ${rtpContrib}%`);
  }
  console.log("═".repeat(60) + "\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseArgs();
  const gitCommit = getGitCommit();

  console.log(`\nTape-Run-Slot Simulator`);
  console.log(`Runs: ${config.runs.toLocaleString()}  Bet: ${config.bet}  Ante: ${config.ante ? "yes" : "no"}  Policy: ${config.policy}  Seeds: ${config.seedStart}+`);
  console.log(`Progress: `);

  const t0 = Date.now();
  let lastPrint = 0;

  const { report, sample } = runSimulation(
    { ...config, gitCommit },
    (done, total) => {
      const now  = Date.now();
      const pct  = ((done / total) * 100).toFixed(0).padStart(3);
      const rps  = Math.round(done / ((now - t0) / 1000));
      process.stdout.write(`\r  ${pct}%  [${done.toLocaleString()} / ${total.toLocaleString()}]  ${rps.toLocaleString()} runs/s  `);
      lastPrint = now;
    },
  );
  process.stdout.write("\r" + " ".repeat(70) + "\r"); // clear progress line

  const elapsed = Date.now() - t0;

  // ── Write outputs ──────────────────────────────────────────────────────────
  const reportsDir = config._reportsDir;
  mkdirSync(reportsDir, { recursive: true });

  function runsLabel(n: number): string {
    if (n >= 1_000_000 && n % 1_000_000 === 0) return `${n / 1_000_000}m`;
    if (n >= 1_000     && n % 1_000     === 0) return `${n / 1_000}k`;
    return `${n}`;
  }

  const tagSuffix  = config._tag ? `_${config._tag}` : "";
  const jsonPath   = join(reportsDir, `sim_report_${config.policy}_${runsLabel(config.runs)}${tagSuffix}.json`);
  const csvPath    = join(reportsDir, `sim_runs_sample_${config.policy}${tagSuffix}.csv`);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf-8");
  writeFileSync(csvPath,  buildCsv(sample), "utf-8");

  printSummary(report, elapsed);

  console.log(`  Reports written to:`);
  console.log(`    ${jsonPath}`);
  console.log(`    ${csvPath}`);
  console.log();
}

main().catch(err => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
