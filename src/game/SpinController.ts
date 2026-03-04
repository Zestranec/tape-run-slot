import { RNG } from "../core/RNG";
import { TapeSlotModel, REEL_COUNT } from "./TapeSlotModel";
import { GameStateMachine } from "../core/GameStateMachine";
import { ReelAnimator } from "./ReelAnimator";

export interface SpinResult {
  deltas: number[];
  fromOffsets: number[];
  toOffsets: number[];
}

export class SpinController {
  private model: TapeSlotModel;
  private fsm: GameStateMachine;
  private animator: ReelAnimator;
  private _lastSpin: SpinResult | null = null;

  /**
   * Increments each time requestSpin is called.
   * Combined with model.seed in the RNG seed so that:
   *   - Same seed + same spinCount → same outcome (determinism across page reloads).
   *   - Resetting to 0 when rebuildFromSeed is called restores the sequence.
   */
  private spinCount: number = 0;

  get lastSpin(): SpinResult | null {
    return this._lastSpin;
  }

  constructor(model: TapeSlotModel, fsm: GameStateMachine, animator: ReelAnimator) {
    this.model = model;
    this.fsm = fsm;
    this.animator = animator;
  }

  /** Must be called whenever model.rebuildFromSeed() is called so spin sequence restarts. */
  reset(): void {
    this.spinCount = 0;
    this._lastSpin = null;
  }

  requestSpin(onComplete: () => void): void {
    if (this.fsm.isLocked) return;

    // --- Outcome resolved BEFORE animation begins ---
    // RNG seed combines model seed with spinCount for cross-reload determinism.
    this.spinCount++;
    const rng = new RNG(this.model.seed * 31337 + this.spinCount);

    const fromOffsets = this.model.getOffsets();
    const deltas: number[] = [];
    const toOffsets: number[] = [];

    for (let i = 0; i < REEL_COUNT; i++) {
      // Always consume RNG for every reel so the outcome for reel i is the same
      // regardless of which other reels happen to be locked this spin.
      const rawDelta = rng.nextInt(1, this.model.tapeLength - 1);
      const delta = this.model.isLocked(i) ? 0 : rawDelta;
      deltas.push(delta);
      toOffsets.push((fromOffsets[i] + delta) % this.model.tapeLength);
    }

    this._lastSpin = { deltas, fromOffsets: [...fromOffsets], toOffsets };

    // Lock input for the duration of the animation.
    this.fsm.transition("running");

    // If every reel is locked there is nothing to animate — resolve immediately.
    if (deltas.every((d) => d === 0)) {
      // toOffsets === fromOffsets, so setOffset calls are no-ops, but kept for consistency.
      for (let i = 0; i < REEL_COUNT; i++) {
        this.model.reels[i].setOffset(toOffsets[i]);
      }
      this.fsm.transition("resolve");
      this.fsm.transition("idle");
      onComplete();
      return;
    }

    this.animator.animate(this._lastSpin, () => {
      // Snap model to the pre-decided final offsets — guaranteed to match animation endpoint.
      for (let i = 0; i < REEL_COUNT; i++) {
        this.model.reels[i].setOffset(toOffsets[i]);
      }
      this.fsm.transition("resolve");
      this.fsm.transition("idle");
      onComplete();
    });
  }
}
