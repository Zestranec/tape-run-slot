import { RNG } from "../core/RNG";
import { TapeReel } from "./TapeReel";

export const REEL_COUNT = 7;
export const DEFAULT_TAPE_LENGTH = 30;

export class TapeSlotModel {
  reels: TapeReel[] = [];
  private _seed: number;
  readonly tapeLength: number;

  /** Per-reel lock state. Locked reels receive delta=0 on spin. */
  private _locks: boolean[] = new Array(REEL_COUNT).fill(false);

  get seed(): number {
    return this._seed;
  }

  constructor(seed: number = 42, tapeLength: number = DEFAULT_TAPE_LENGTH) {
    this._seed = seed;
    this.tapeLength = tapeLength;
    this.rebuildFromSeed(seed);
  }

  rebuildFromSeed(seed: number): void {
    this._seed = seed;
    const rng = new RNG(seed);
    this.reels = [];
    for (let i = 0; i < REEL_COUNT; i++) {
      this.reels.push(TapeReel.generate(rng, this.tapeLength));
    }
    // Full rebuild resets locks — fresh tapes, fresh configuration.
    this._locks = new Array(REEL_COUNT).fill(false);
  }

  // ── Lock state API ──────────────────────────────────────────────────────────

  isLocked(i: number): boolean {
    return this._locks[i] ?? false;
  }

  setLocked(i: number, value: boolean): void {
    this._locks[i] = value;
  }

  toggleLocked(i: number): void {
    this._locks[i] = !this._locks[i];
  }

  /** Returns a copy of the lock state array. */
  getLockStates(): boolean[] {
    return [...this._locks];
  }

  /** Reset all locks to false (does NOT touch offsets or tapes). */
  resetLocks(): void {
    this._locks = new Array(REEL_COUNT).fill(false);
  }

  /** Returns array of 7 center digits. */
  getVisibleCenterDigits(): number[] {
    return this.reels.map((r) => r.getVisible().center);
  }

  /** Human-readable string like "4 7 2 9 1 3 6". */
  getVisibleString(): string {
    return this.getVisibleCenterDigits().join(" ");
  }

  getOffsets(): number[] {
    return this.reels.map((r) => r.offset);
  }

  /** Randomize all offsets deterministically from a sub-RNG. */
  randomizeOffsets(rng: RNG): void {
    for (const reel of this.reels) {
      reel.setOffset(rng.nextInt(0, reel.length - 1));
    }
  }

  resetOffsets(): void {
    for (const reel of this.reels) {
      reel.setOffset(0);
    }
  }
}
