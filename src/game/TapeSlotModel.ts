import { RNG } from "../core/RNG";
import { TapeReel } from "./TapeReel";

export const REEL_COUNT = 7;
export const DEFAULT_TAPE_LENGTH = 30;

export class TapeSlotModel {
  reels: TapeReel[] = [];
  private _seed: number;
  readonly tapeLength: number;

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
