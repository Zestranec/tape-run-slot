import { RNG } from "../core/RNG";
import { SYMBOL_POOL } from "../types/PokerTypes";

export interface VisibleDigits {
  above:  number; // symbol index
  center: number; // symbol index
  below:  number; // symbol index
}

export class TapeReel {
  readonly tape: number[]; // symbol indices 0-16
  private _offset: number = 0;

  get offset(): number  { return this._offset; }
  get length(): number  { return this.tape.length; }

  constructor(tape: number[]) {
    this.tape = tape;
  }

  /**
   * Build a tape of the given length using weighted symbol generation.
   * Joker has weight 0.33 relative to each normal symbol (weight 1.0).
   * Uses SYMBOL_POOL: 100 entries per normal symbol, 33 for Joker — total 1633.
   */
  static generate(rng: RNG, length: number): TapeReel {
    const tape: number[] = [];
    const poolLen = SYMBOL_POOL.length; // 1633
    for (let i = 0; i < length; i++) {
      tape.push(SYMBOL_POOL[rng.nextInt(0, poolLen - 1)]);
    }
    return new TapeReel(tape);
  }

  private wrap(index: number): number {
    const len = this.tape.length;
    return ((index % len) + len) % len;
  }

  getVisible(): VisibleDigits {
    return {
      above:  this.tape[this.wrap(this._offset - 1)],
      center: this.tape[this.wrap(this._offset)],
      below:  this.tape[this.wrap(this._offset + 1)],
    };
  }

  nudge(delta: number): void {
    this._offset = this.wrap(this._offset + delta);
  }

  setOffset(offset: number): void {
    this._offset = this.wrap(offset);
  }
}
