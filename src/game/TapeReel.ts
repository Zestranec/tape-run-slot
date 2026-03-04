import { RNG } from "../core/RNG";

export interface VisibleDigits {
  above: number;
  center: number;
  below: number;
}

export class TapeReel {
  readonly tape: number[];
  private _offset: number = 0;

  get offset(): number {
    return this._offset;
  }

  get length(): number {
    return this.tape.length;
  }

  constructor(tape: number[]) {
    this.tape = tape;
  }

  /** Build a tape of given length using RNG, preventing 3+ identical in a row. */
  static generate(rng: RNG, length: number): TapeReel {
    const tape: number[] = [];
    for (let i = 0; i < length; i++) {
      let digit: number;
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
      tape.push(digit);
    }
    return new TapeReel(tape);
  }

  private wrap(index: number): number {
    const len = this.tape.length;
    return ((index % len) + len) % len;
  }

  getVisible(): VisibleDigits {
    return {
      above: this.tape[this.wrap(this._offset - 1)],
      center: this.tape[this.wrap(this._offset)],
      below: this.tape[this.wrap(this._offset + 1)],
    };
  }

  nudge(delta: number): void {
    this._offset = this.wrap(this._offset + delta);
  }

  setOffset(offset: number): void {
    this._offset = this.wrap(offset);
  }
}
